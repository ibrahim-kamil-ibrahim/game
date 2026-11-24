import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Textarea } from './Input';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  requireReason?: boolean;
  reasonLabel?: string;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
  requireReason = false,
  reasonLabel = 'Reason',
  children,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      disableClose={loading}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={requireReason && reason.trim().length < 3}
            onClick={() => {
              onConfirm(reason.trim());
              setReason('');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm leading-6 text-navy-600">{description}</p>
      </div>
      {children}
      {requireReason ? (
        <div className="mt-4">
          <label className="label" htmlFor="confirm-reason">
            {reasonLabel} <span className="text-danger-500">*</span>
          </label>
          <Textarea
            id="confirm-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this action is being taken"
            maxLength={500}
          />
        </div>
      ) : null}
    </Modal>
  );
}
