import type { PasswordResetLink, UserSummary } from '@alipe3d/shared';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/utils/format';

interface ResetLinkModalProps {
  user: UserSummary | null;
  link: PasswordResetLink | null;
  onClose: () => void;
}

/** Mostra o link de redefinição gerado pelo administrador (alternativa ao envio por e-mail). */
export function ResetLinkModal({ user, link, onClose }: ResetLinkModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sem permissão de área de transferência: o campo continua selecionável.
    }
  };

  return (
    <Modal
      open={!!link}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title="Link de redefinição de senha"
      description={user ? `Para ${user.name} (${user.email})` : undefined}
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      {link && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Envie este link ao usuário por um canal seguro. Ele vale uma única vez, até{' '}
            <strong className="text-ink">{formatDateTime(link.expiresAt)}</strong>. Links anteriores
            deste usuário deixaram de valer.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Link de redefinição"
              className="font-mono text-xs"
            />
            <Button
              variant="secondary"
              onClick={() => void copy()}
              icon={
                copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />
              }
            >
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <Alert tone="info">O link não será exibido novamente. Se perder, gere outro.</Alert>
        </div>
      )}
    </Modal>
  );
}
