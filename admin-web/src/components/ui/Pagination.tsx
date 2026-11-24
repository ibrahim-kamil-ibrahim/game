import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Meta } from '../../types';
import { cn } from '../../lib/utils';

export function Pagination({
  meta,
  onPageChange,
  className,
}: {
  meta: Meta;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);

  const pages: number[] = [];
  const from = Math.max(1, meta.page - 2);
  const to = Math.min(meta.totalPages, from + 4);
  for (let page = from; page <= to; page += 1) pages.push(page);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 border-t border-navy-100 px-4 py-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-xs text-navy-500">
        Showing <span className="font-semibold text-navy-700">{start}</span>–
        <span className="font-semibold text-navy-700">{end}</span> of{' '}
        <span className="font-semibold text-navy-700">{meta.total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-icon h-8 w-8 disabled:opacity-40"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={!meta.hasPreviousPage}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={cn(
              'h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition',
              page === meta.page
                ? 'bg-navy-900 text-white'
                : 'text-navy-500 hover:bg-navy-100 hover:text-navy-900',
            )}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          className="btn-icon h-8 w-8 disabled:opacity-40"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={!meta.hasNextPage}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
