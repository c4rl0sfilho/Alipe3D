import type { ListPrintJobsQuery } from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { jobColumns, type JobColumnsOptions } from './job-columns';
import { productionApi, productionKeys } from './production.api';

/** Histórico paginado de impressões com um filtro fixo (impressora, falhas...). */
export function JobsHistory({
  filter,
  emptyTitle,
  emptyDescription,
  ...options
}: JobColumnsOptions & {
  filter: Omit<ListPrintJobsQuery, 'page' | 'pageSize'>;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const [page, setPage] = useState(1);
  const query: ListPrintJobsQuery = { ...filter, page, pageSize: 20 };
  const jobs = useQuery({
    queryKey: productionKeys.jobs(query),
    queryFn: () => productionApi.listJobs(query),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <DataTable
        columns={jobColumns(options)}
        rows={jobs.data?.items}
        rowKey={(j) => j.id}
        loading={jobs.isFetching}
        empty={<EmptyState icon={History} title={emptyTitle} description={emptyDescription} />}
      />
      {jobs.data && (
        <Pagination
          page={jobs.data.meta.page}
          totalPages={jobs.data.meta.totalPages}
          totalItems={jobs.data.meta.totalItems}
          pageSize={jobs.data.meta.pageSize}
          onPageChange={setPage}
        />
      )}
    </>
  );
}
