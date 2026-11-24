import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { copyText } from '../lib/utils';

export interface CredentialSet {
  fullName: string;
  username: string;
  password: string;
}

export function CredentialsModal({
  open,
  credentials,
  title = 'Employer account created',
  description = 'Share these credentials with the employer securely.',
  onClose,
}: {
  open: boolean;
  credentials: CredentialSet | null;
  title?: string;
  description?: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!credentials) return null;

  const copy = async (value: string, key: string, label: string) => {
    const ok = await copyText(value);
    if (!ok) {
      toast.error('Could not copy to the clipboard');
      return;
    }
    setCopied(key);
    toast.success(`${label} copied`);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
  };

  const copyAll = async () => {
    const text = [
      'GameZone Employer sign-in',
      `Name: ${credentials.fullName}`,
      `Username: ${credentials.username}`,
      `Temporary password: ${credentials.password}`,
      '',
      'Sign in with the GameZone Employer app. Change the password after signing in.',
    ].join('\n');
    const ok = await copyText(text);
    if (!ok) {
      toast.error('Could not copy to the clipboard');
      return;
    }
    toast.success('Credentials copied');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button variant="primary" icon={<Copy className="h-4 w-4" />} onClick={copyAll}>
            Copy both
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-lg border border-success-500/20 bg-success-50 px-3.5 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
        <p className="text-xs leading-5 text-success-600">
          The password is stored encrypted and can be viewed again on this employer's detail page until
          they sign in for the first time. It is then permanently removed.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-navy-200 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-navy-500 uppercase">
              <UserRound className="h-3.5 w-3.5" /> Username
            </span>
            <button
              type="button"
              className="btn-icon h-7 w-7"
              onClick={() => copy(credentials.username, 'username', 'Username')}
              aria-label="Copy username"
            >
              {copied === 'username' ? <Check className="h-3.5 w-3.5 text-success-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold break-all text-navy-900">
            {credentials.username}
          </p>
        </div>

        <div className="rounded-lg border border-navy-200 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-navy-500 uppercase">
              <KeyRound className="h-3.5 w-3.5" /> Temporary password
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-icon h-7 w-7"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? 'Hide password' : 'Show password'}
              >
                {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className="btn-icon h-7 w-7"
                onClick={() => copy(credentials.password, 'password', 'Password')}
                aria-label="Copy password"
              >
                {copied === 'password' ? <Check className="h-3.5 w-3.5 text-success-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold break-all text-navy-900">
            {visible ? credentials.password : '••••••••••••'}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-navy-500">
        Send the credentials through a private channel. The employer can change the password after the
        first sign-in.
      </p>
    </Modal>
  );
}
