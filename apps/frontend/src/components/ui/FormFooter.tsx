import { Button } from './Button';

interface FormFooterProps {
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
}

/** Rodapé padrão dos formulários em modal: Cancelar + ação principal. */
export function FormFooter({ onCancel, submitLabel, loading }: FormFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={loading}>
        Cancelar
      </Button>
      <Button type="submit" loading={loading}>
        {submitLabel}
      </Button>
    </div>
  );
}
