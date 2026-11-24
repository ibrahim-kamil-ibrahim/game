import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getSettings, updateSettings, type UpdateSettingsInput } from '../services/settings';
import { fetchMe } from '../services/auth';
import { useAuthStore } from '../stores/auth';
import { PageHeader, SectionCard, StatCard } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Toggle } from '../components/ui/Input';
import { ErrorState, LoadingState } from '../components/ui/States';
import { errorMessage, formatDateTime } from '../lib/utils';

const timezones = [
  'Africa/Addis_Ababa',
  'Africa/Nairobi',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'UTC',
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [form, setForm] = useState<UpdateSettingsInput>({});

  useEffect(() => {
    if (!query.data) return;
    const { business, settings } = query.data;
    setForm({
      businessName: business.name,
      businessPhone: business.phone ?? '',
      businessAddress: business.address ?? '',
      timezone: business.timezone,
      allowExtension: settings.allowExtension,
      allowPause: settings.allowPause,
      allowManualEnd: settings.allowManualEnd,
      requireEndReason: settings.requireEndReason,
      expiryWarningMinutes: settings.expiryWarningMinutes,
      lowCashThresholdSantim: settings.lowCashThresholdSantim,
    });
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (input: UpdateSettingsInput) => updateSettings(input),
    onSuccess: async () => {
      toast.success('Business settings saved');
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      const user = await fetchMe();
      setUser(user);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Business Settings" />
        <LoadingState />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Business Settings" />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const save = () => {
    mutation.mutate({
      ...form,
      businessPhone: form.businessPhone || null,
      businessAddress: form.businessAddress || null,
      lowCashThresholdSantim:
        form.lowCashThresholdSantim === undefined || form.lowCashThresholdSantim === null
          ? null
          : Number(form.lowCashThresholdSantim),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Settings"
        subtitle="Operational rules, opening details and rental policy"
        actions={
          <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={mutation.isPending} onClick={save}>
            Save settings
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Business"
          value={query.data.business.name}
          icon={<Building2 className="h-5 w-5" />}
          tone="navy"
        />
        <StatCard
          label="Currency"
          value={query.data.business.currency}
          hint="All values are stored as integer santim"
          tone="green"
        />
        <StatCard
          label="Timezone"
          value={query.data.business.timezone}
          hint="Used for daily reports"
          tone="blue"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Business profile" description="Shown on reports and receipts">
          <div className="space-y-4">
            <Field label="Business name" htmlFor="businessName" required>
              <Input
                id="businessName"
                value={form.businessName ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="businessPhone">
                <Input
                  id="businessPhone"
                  value={form.businessPhone ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, businessPhone: event.target.value }))}
                />
              </Field>
              <Field label="Timezone" htmlFor="timezone">
                <Select
                  id="timezone"
                  value={form.timezone ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                >
                  {timezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Address" htmlFor="businessAddress">
              <Input
                id="businessAddress"
                value={form.businessAddress ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, businessAddress: event.target.value }))}
              />
            </Field>
            <p className="rounded-lg bg-navy-50 px-3.5 py-2.5 text-xs leading-5 text-navy-500">
              Times are stored in UTC and displayed in the business timezone. Changing the timezone affects
              how new reports are grouped, not historical timestamps.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Rental rules" description="What employers are allowed to do from the mobile app">
          <div className="space-y-5">
            {[
              {
                key: 'allowExtension' as const,
                label: 'Allow session extensions',
                description: 'Employers can sell an additional package and extend an active session.',
              },
              {
                key: 'allowPause' as const,
                label: 'Allow pausing sessions',
                description: 'Employers can pause and resume the countdown. Administrators can always pause.',
              },
              {
                key: 'allowManualEnd' as const,
                label: 'Allow manual early ending',
                description: 'Employers can end a session before its timer expires.',
              },
              {
                key: 'requireEndReason' as const,
                label: 'Require a reason when ending',
                description: 'The employer must describe why a session was ended early.',
              },
            ].map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-navy-900">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-navy-500">{item.description}</p>
                </div>
                <Toggle
                  label={item.label}
                  checked={Boolean(form[item.key])}
                  onChange={(checked) => setForm((current) => ({ ...current, [item.key]: checked }))}
                />
              </div>
            ))}

            <div className="grid gap-4 border-t border-navy-100 pt-4 sm:grid-cols-2">
              <Field
                label="Expiry warning (minutes)"
                htmlFor="expiryWarning"
                hint="Employers receive a warning before the timer ends"
              >
                <Input
                  id="expiryWarning"
                  type="number"
                  min={1}
                  max={60}
                  value={form.expiryWarningMinutes ?? 5}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expiryWarningMinutes: Number(event.target.value) }))
                  }
                />
              </Field>
              <Field
                label="Low cash alert (ETB)"
                htmlFor="lowCash"
                hint="Optional: alert admins when daily collections are below this"
              >
                <Input
                  id="lowCash"
                  type="number"
                  min={0}
                  step="0.01"
                  value={
                    form.lowCashThresholdSantim === null || form.lowCashThresholdSantim === undefined
                      ? ''
                      : form.lowCashThresholdSantim / 100
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      lowCashThresholdSantim:
                        event.target.value === '' ? null : Math.round(Number(event.target.value) * 100),
                    }))
                  }
                />
              </Field>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Administrative safeguards">
          <div className="space-y-3 text-sm text-navy-600">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
              Employers can never change prices, durations or machine configuration. The backend rejects any
              attempt regardless of the client application.
            </p>
            <p className="flex items-start gap-2">
              <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              Every change on this page is written to the audit log with the previous and new values.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Business record">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Created</dt>
              <dd className="font-medium text-navy-900">{formatDateTime(query.data.business.createdAt ?? null)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Business ID</dt>
              <dd className="font-mono text-xs break-all text-navy-700">{query.data.business.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-navy-500">Settings updated</dt>
              <dd className="font-medium text-navy-900">{formatDateTime(query.data.settings.updatedAt)}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
