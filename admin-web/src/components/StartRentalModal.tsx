import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Play, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { getMachine } from '../services/machines';
import { listEmployers } from '../services/employers';
import { createCashPayment } from '../services/payments';
import { startSession } from '../services/sessions';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Input';
import { LoadingState } from './ui/States';
import { errorMessage, formatEtb } from '../lib/utils';
import type { Machine } from '../types';

/**
 * Administrative rental flow: the admin records cash collected by a selected
 * employer and starts the session. The backend still validates the machine,
 * package, employer and cash state; no client price is trusted.
 */
export function StartRentalModal({
  machine,
  open,
  onClose,
  onStarted,
}: {
  machine: Machine | null;
  open: boolean;
  onClose: () => void;
  onStarted?: (sessionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [employerId, setEmployerId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [cashReceived, setCashReceived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRef, setPaymentRef] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>('');

  const machineQuery = useQuery({
    queryKey: ['machine', machine?.id, 'start-rental'],
    queryFn: () => getMachine(machine!.id),
    enabled: open && !!machine,
  });

  const employersQuery = useQuery({
    queryKey: ['employers', 'active-select'],
    queryFn: () => listEmployers({ status: 'ACTIVE', pageSize: 100 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setEmployerId('');
    setPackageId('');
    setCashReceived(false);
    setError(null);
    setPaymentRef(null);
    // One key per modal attempt so a retry after a lost response reuses the
    // same payment instead of charging twice in the ledger.
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [open, machine?.id]);

  useEffect(() => {
    if (!packageId && machineQuery.data?.packages.length) {
      setPackageId(machineQuery.data.packages[0].id);
    }
  }, [machineQuery.data, packageId]);

  const selectedPackage = machineQuery.data?.packages.find((pkg) => pkg.id === packageId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!machine || !packageId || !employerId) {
        throw new Error('Select an employer and a package');
      }
      const idempotencyKey = idempotencyKeyRef.current || crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      const payment = await createCashPayment({
        machineId: machine.id,
        packageId,
        employerId,
        idempotencyKey,
      });
      setPaymentRef(payment.transactionRef);
      const session = await startSession(payment.id);
      return session;
    },
    onSuccess: async (session) => {
      toast.success('Session started', {
        description: `${machine?.name ?? 'Machine'} • ${selectedPackage?.name ?? 'Package'}`,
      });
      await queryClient.invalidateQueries({ queryKey: ['live'] });
      await queryClient.invalidateQueries({ queryKey: ['machines'] });
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onStarted?.(session.id);
      onClose();
    },
    onError: (mutationError) => {
      setError(errorMessage(mutationError));
      void queryClient.invalidateQueries({ queryKey: ['live'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a rental"
      description={
        machine
          ? `Record cash collected by an employer and start ${machine.name}`
          : 'Select a machine first'
      }
      size="md"
      disableClose={mutation.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Play className="h-4 w-4" />}
            loading={mutation.isPending}
            disabled={!cashReceived || !employerId || !packageId}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Confirm cash & start
          </Button>
        </>
      }
    >
      {machineQuery.isLoading ? (
        <LoadingState label="Loading packages and employers" />
      ) : machineQuery.isError ? (
        <p className="text-sm text-danger-600">{errorMessage(machineQuery.error)}</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-navy-50 px-3.5 py-3 text-xs leading-5 text-navy-600">
            Use this when the employer is busy and an administrator needs to start the rental. Cash must
            already be in the employer's hands. The payment is recorded against that employer.
          </div>

          <div>
            <label className="label" htmlFor="start-employer">
              Cash collected by <span className="text-danger-500">*</span>
            </label>
            <Select
              id="start-employer"
              value={employerId}
              onChange={(event) => setEmployerId(event.target.value)}
            >
              <option value="">Select an active employer</option>
              {(employersQuery.data?.items ?? []).map((employer) => (
                <option key={employer.id} value={employer.id}>
                  {employer.fullName} (@{employer.username})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="label" htmlFor="start-package">
              Package <span className="text-danger-500">*</span>
            </label>
            <Select
              id="start-package"
              value={packageId}
              onChange={(event) => setPackageId(event.target.value)}
            >
              <option value="">Select a package</option>
              {(machineQuery.data?.packages ?? []).map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — {pkg.durationMinutes} min — {formatEtb(pkg.priceSantim)}
                </option>
              ))}
            </Select>
          </div>

          {selectedPackage ? (
            <div className="flex items-center justify-between rounded-lg border border-navy-200 px-3.5 py-3">
              <div className="flex items-center gap-2 text-sm text-navy-700">
                <ReceiptText className="h-4 w-4 text-navy-400" />
                <span>{selectedPackage.durationMinutes} minutes</span>
              </div>
              <span className="text-lg font-bold text-navy-900">
                {formatEtb(selectedPackage.priceSantim)}
              </span>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-navy-200 px-3.5 py-3">
            <input
              type="checkbox"
              checked={cashReceived}
              onChange={(event) => setCashReceived(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-navy-800">
                Cash has been collected
              </span>
              <span className="mt-0.5 block text-xs text-navy-500">
                I confirm the employer received the exact cash amount. This creates an immutable payment.
              </span>
            </span>
          </label>

          {paymentRef ? (
            <div className="flex items-start gap-2 rounded-lg bg-success-50 px-3.5 py-2.5 text-xs text-success-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Payment {paymentRef} recorded. Starting the session...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-danger-500/25 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
