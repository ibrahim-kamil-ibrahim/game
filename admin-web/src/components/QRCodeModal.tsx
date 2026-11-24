import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { fetchQrBlob, downloadQr, regenerateQr } from '../services/machines';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LoadingState } from './ui/States';
import { errorMessage } from '../lib/utils';
import type { Machine } from '../types';

export function QRCodeModal({
  machine,
  open,
  onClose,
}: {
  machine: Machine | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const qrQuery = useQuery({
    queryKey: ['machine-qr', machine?.id],
    queryFn: () => fetchQrBlob(machine!.id),
    enabled: open && !!machine,
    gcTime: 0,
  });

  useEffect(() => {
    if (!qrQuery.data) return;
    const url = URL.createObjectURL(qrQuery.data);
    setImageUrl(url);
    setImageError(null);
    return () => URL.revokeObjectURL(url);
  }, [qrQuery.data]);

  useEffect(() => {
    if (qrQuery.isError) setImageError(errorMessage(qrQuery.error));
  }, [qrQuery.isError, qrQuery.error]);

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateQr(machine!.id),
    onSuccess: async (result) => {
      toast.success(`New QR code generated (v${result.version})`);
      setConfirmRegenerate(false);
      await queryClient.invalidateQueries({ queryKey: ['machine-qr', machine?.id] });
      await queryClient.invalidateQueries({ queryKey: ['machines'] });
      await queryClient.invalidateQueries({ queryKey: ['machine', machine?.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const handleDownload = async (format: 'png' | 'pdf') => {
    if (!machine) return;
    try {
      await downloadQr(machine.id, machine.code, format);
      toast.success(`QR code downloaded as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handlePrint = () => {
    if (!machine || !imageUrl) return;
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) {
      toast.error('Allow pop-ups to print the QR code');
      return;
    }
    win.document.write(`
      <html>
        <head><title>${machine.name} QR Code</title></head>
        <body style="font-family: system-ui, sans-serif; text-align: center; padding: 40px;">
          <h1 style="font-size: 22px; margin: 0 0 4px;">${machine.name}</h1>
          <p style="color:#555; margin: 0 0 24px;">${machine.code}</p>
          <img src="${imageUrl}" style="width: 380px; height: 380px;" alt="QR code" />
          <p style="margin-top: 24px; color:#555; font-size: 13px;">Scan with the Employer mobile application</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Machine QR code"
        description={machine ? `${machine.name} • ${machine.code}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRegenerate(true)}>
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={handlePrint} disabled={!imageUrl}>
              Print
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => handleDownload('pdf')}
            >
              PDF
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => handleDownload('png')}
            >
              PNG
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center">
          {qrQuery.isLoading ? (
            <LoadingState label="Generating QR code" />
          ) : imageError ? (
            <p className="py-10 text-sm text-danger-600">{imageError}</p>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={`QR code for ${machine?.name ?? 'machine'}`}
              className="h-64 w-64 rounded-xl border border-navy-200 bg-white p-3 shadow-sm"
            />
          ) : null}

          <div className="mt-5 text-center">
            <p className="text-sm font-semibold text-navy-900">{machine?.name}</p>
            <p className="text-xs text-navy-500">
              {machine?.code} • QR version {machine?.qr?.version ?? '—'}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-navy-500">
              Print this code and attach it to the machine. Each code is unique and cannot be guessed.
              Regenerating it immediately invalidates the previous printed code.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRegenerate}
        title="Regenerate QR code?"
        description="The existing printed QR code will stop working immediately. You will need to print and attach the new code."
        confirmLabel="Regenerate QR"
        loading={regenerateMutation.isPending}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => regenerateMutation.mutate()}
      />
    </>
  );
}
