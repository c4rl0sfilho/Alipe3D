# Alipe3D Manager

Gestão operacional, comercial e financeira da Alipe3D: produtos, estoque, produção, impressoras, pedidos, financeiro e relatórios em uma única plataforma.

> **Status:** Fases 1 (Fundação), 2 (Autenticação, usuários e permissões), 3 (Produtos e estoque) e 4 (Impressoras e produção) concluídas. Planejamento, DER e cronograma em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Stack

- **Frontend:** React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router, TanStack Query, Axios, React Hook Form, Zod, Recharts, Lucide.
- **Backend:** Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL 18, Zod, JWT, bcrypt, Pino, Helmet, Swagger.
- **Infra:** npm workspaces, Docker Compose, ESLint, Prettier, Vitest.

## Pré-requisitos

- Node.js 24 ou superior (testado com 26 LTS) e npm 10+
- Docker Desktop (no Windows, com WSL 2)

## Executando localmente (desenvolvimento)

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de ambiente
cp .env.example .env        # no PowerShell: Copy-Item .env.example .env
#    Edite o .env: senha do banco, JWT_ACCESS_SECRET e SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD

# 3. Subir o PostgreSQL
npm run db:up

# 4. Criar as tabelas e os dados essenciais (permissões, perfis e o primeiro administrador)
npm run db:migrate
npm run db:seed

# 5. Iniciar pacote compartilhado + API + interface
npm run dev
```

| Serviço              | Endereço                       |
| -------------------- | ------------------------------ |
| Interface            | http://localhost:5173          |
| API                  | http://localhost:3333/api/v1   |
| Documentação Swagger | http://localhost:3333/api/docs |

### Primeiro acesso

1. Entre com o `SEED_ADMIN_EMAIL` e a `SEED_ADMIN_PASSWORD` definidos no `.env`.
2. O sistema pede a troca dessa senha provisória antes de liberar o acesso.
3. Em **Administração → Usuários**, cadastre as demais pessoas. Cada uma recebe uma senha provisória e também precisa trocá-la no primeiro acesso.

O seed só cria o administrador se ainda não existir nenhum. Depois do primeiro acesso, os valores `SEED_ADMIN_*` do `.env` deixam de ser usados e podem ser apagados.

### Recuperação de senha

- **Com SMTP configurado** (`SMTP_*` no `.env`): a pessoa clica em "Esqueci minha senha" e recebe um link por e-mail, válido por 60 minutos.
- **Sem SMTP** (padrão): o administrador abre **Usuários**, usa o botão de chave ao lado da pessoa e repassa o link gerado, válido por 24 horas. Em desenvolvimento, o link pedido em "Esqueci minha senha" também aparece no log da API.

## Módulos disponíveis

| Módulo            | O que já faz                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Produtos**      | Catálogo com SKU, categoria, preço, peso, tempo de impressão e estoque mínimo. Variações (cor, material, tamanho, modelo) com SKU e valores próprios. Ficha técnica por variação (gramas de filamento + insumos). Fotos, STL, 3MF, perfis de impressão e PDFs.                                                                                                                                                                            |
| **Estoque**       | Filamentos e rolos em gramas (código `R-0001` por carretel, custo por grama, conferência por pesagem). Insumos com custo médio. Produtos acabados por variação. Entradas, saídas, perdas, desperdícios, devoluções e ajustes, com histórico, responsável e saldo após cada lançamento. Fornecedores. Alertas de reposição.                                                                                                                |
| **Produção**      | Ordens de produção (OP-0001…) com produto, variação, quantidade, filamento, impressora, prazo, prioridade e responsável. Fila por prioridade e prazo, com filtros e agrupamento por filamento. Impressões com início, pausa e finalização: baixa do peso real de cada rolo uma única vez. Falhas com motivo, desperdício, tempo perdido e refabricação. Inspeção: peças aprovadas entram no estoque e baixam os insumos da ficha técnica. |
| **Impressoras**   | ALIPE-PRINTER-01 e 02 (Bambu Lab A1) cadastradas pelo seed. Situação ao vivo (disponível, imprimindo, pausada, manutenção, inativa), horas acumuladas, histórico de impressões, falhas e manutenções, com alerta da próxima manutenção. Controle manual: nenhuma comunicação com a impressora é simulada.                                                                                                                                 |
| **Administração** | Usuários, perfis de acesso, permissões e auditoria.                                                                                                                                                                                                                                                                                                                                                                                       |

### Primeiros passos sugeridos

1. **Estoque → Fornecedores:** cadastre onde você compra filamento e insumos.
2. **Estoque → Filamentos:** cadastre cada filamento (ex.: PLA Basic Preto, Bambu Lab) com o estoque mínimo em gramas.
3. Ainda em **Filamentos**, use o botão **Rolo** para registrar os rolos que você tem. Etiquete cada carretel com o código gerado (R-0001…).
4. **Estoque → Insumos:** cadastre embalagens e etiquetas e lance a quantidade com **Entrada por compra**.
5. **Produtos:** cadastre os produtos, as variações e a ficha técnica.
6. **Estoque → Produtos acabados:** lance o que já está pronto com **Ajuste manual** (motivo: contagem inicial).
7. **Impressoras:** confira as duas A1, informe as horas já impressas (contador da impressora) e registre a última manutenção.
8. **Produção → Nova ordem:** escolha produto, quantidade e prazo. Peso, tempo e filamento vêm da ficha técnica.

### Fluxo da produção

1. **Iniciar impressão:** escolha a impressora e o rolo carregado. A impressora fica ocupada; nada é baixado ainda.
2. **Finalizar impressão:** informe o peso real consumido (de um ou mais rolos) e as peças produzidas. O filamento sai do estoque nesse momento, uma única vez, mesmo que o botão seja clicado de novo.
3. **Registrar falha** (no lugar de finalizar): motivo, filamento desperdiçado, tempo perdido e se as peças serão refeitas.
4. **Inspeção:** as peças aprovadas entram no estoque de produto acabado e os insumos da ficha técnica (caixa, etiqueta) são baixados. Reprovadas podem voltar para a fila.

Para conferir um rolo, use o botão de balança: informe o peso do rolo com o carretel e o sistema calcula o filamento restante e corrige o saldo.

## Testes

```bash
npm test          # testes unitários (não precisam de banco)
npm run test:int  # testes de integração: precisam do PostgreSQL rodando (npm run db:up)
```

Os testes de integração usam um banco separado, `<nome do banco>_test`, recriado do zero a cada execução. O banco principal nunca é tocado.

## Backup

Dois itens precisam de backup:

- **Banco de dados:** `docker exec alipe3d-postgres pg_dump -U alipe3d -Fc alipe3d_manager > backup.dump`
- **Arquivos de produtos:** a pasta `apps/backend/uploads` (ou o `UPLOAD_DIR` configurado). No Docker, é o volume `alipe3d-manager_uploads`.

A rotina automática de backup entra na Fase 7.

## Aplicação completa em containers

```bash
docker compose --profile app up -d --build
```

Interface e API ficam em http://localhost:8080: o nginx serve o frontend e repassa `/api` ao backend. Ao iniciar, o backend aplica as migrations pendentes e roda o seed (idempotente). O Swagger fica desligado nessa configuração.

## Scripts (raiz)

| Script                              | O que faz                                                       |
| ----------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                       | Pacote compartilhado (watch) + API (reinício automático) + Vite |
| `npm run build`                     | Build de produção dos três pacotes                              |
| `npm run typecheck`                 | Verificação de tipos em todos os pacotes                        |
| `npm test` / `npm run test:int`     | Testes unitários / de integração                                |
| `npm run lint` / `npm run format`   | ESLint / Prettier                                               |
| `npm run db:up` / `npm run db:down` | Sobe / derruba o PostgreSQL                                     |
| `npm run db:migrate`                | Cria e aplica migrations (`prisma migrate dev`)                 |
| `npm run db:seed`                   | Permissões, perfis do sistema e primeiro administrador          |
| `npm run db:generate`               | Gera o Prisma Client                                            |
| `npm run db:studio`                 | Abre o Prisma Studio                                            |

## Variáveis de ambiente

Um único `.env` na raiz serve ao Docker Compose, à API, ao Prisma e ao Vite. Todas as variáveis estão documentadas em [.env.example](.env.example). A API valida o `.env` ao iniciar e informa quais variáveis estão erradas. Nunca versione o `.env`.

Para gerar um `JWT_ACCESS_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Segurança (resumo)

- Senhas com bcrypt (custo 12). Tokens de sessão e de redefinição guardados só como hash SHA-256.
- Token de acesso JWT de 15 minutos, mantido apenas em memória no navegador. A sessão longa fica em cookie `httpOnly` + `SameSite=Strict`, restrito às rotas `/api/v1/auth`, e é rotacionada a cada renovação. Se um token antigo for reapresentado, todas as sessões daquela família são encerradas.
- A conta é bloqueada por 15 minutos após 5 senhas erradas, e o login e a recuperação têm limite de tentativas por IP.
- Desativar um usuário, trocar a senha ou mudar permissões vale na hora, sem esperar o token expirar.
- As permissões administrativas (usuários, perfis, auditoria) são exclusivas do perfil Administrador e não podem ser atribuídas a outros perfis.
- Operações importantes ficam registradas em **Administração → Auditoria**.

## Estrutura

```text
apps/backend      API Express (módulos em src/modules)
apps/frontend     Interface React (módulos em src/modules)
packages/shared   Tipos, schemas Zod e catálogo de permissões compartilhados
docs/             Arquitetura, DER e cronograma
```

## Identidade visual

As cores da marca estão centralizadas como tokens do Tailwind em [apps/frontend/src/index.css](apps/frontend/src/index.css) (`brand-*`, `canvas`, `surface`, `ink`, `line`, `success`, `warning`, `danger`). A logo oficial está em `apps/frontend/public/logo-alipe3d.png` e aparece no login, na sidebar e como ícone da aba.
