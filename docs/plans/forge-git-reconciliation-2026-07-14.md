# Forge Git reconciliation — 2026-07-14

Status: `in_progress`
Owner atual: `Coder`
Run: `Memory/Runs-history/2026-07-14-1905-forge-git-reconciliation.md`

## Objective

Transformar o checkout Forge canônico em um estado Git limpo, rastreável e sincronizado com GitHub, preservando toda mudança local e sem reescrever trabalho remoto não auditado.

## Observed context

- `main` local pré-reconciliação: `532939f`.
- `origin/main` após fetch explícito: `e887f51`, squash merge do PR Stripe #5.
- Merge-base: `2b4579a`; divergência final observada: 4 commits locais / 5 remotos.
- Index vazio.
- Tracked modified: `.env.example`, cinco arquivos API de billing/plans, `apps/web/src/pages/Billing.tsx`, `apps/web/src/styles.css` e `docs/engineering/auth-billing-benchline-plan.md`.
- Untracked: três scripts Stripe bootstrap, `apps/web/src/pages/Billing.test.ts`, `apps/web/src/pages/Landing 2.tsx` e `docs/engineering/netolabs-stripe-link-plan.md`.

## Scope

- Inventário e provenance de todas as mudanças.
- Backup refs recuperáveis.
- Reconciliação entre `main`, GitHub e o candidato Stripe existente.
- Commits/branches claros somente para mudanças válidas.
- Worktree limpo, upstream coerente, testes proporcionais.

## Non-goals

- Alterar comportamento do produto sem necessidade de reconciliação.
- Apagar arquivos por parecerem duplicados sem comparar conteúdo/origem.
- Fazer deploy ou merge de PR como efeito colateral deste saneamento.

## Requirements and acceptance

- `FR-1`: todo arquivo local recebe classificação `equivalente-remoto | candidato-valido | duplicata-segura | desconhecido-preservado`.
- `FR-2`: refs de segurança tornam o estado pré-reconciliação recuperável.
- `FR-3`: `main` termina alinhada ao `origin/main` atual, sem commits locais órfãos.
- `FR-4`: trabalho não presente em `main` fica em branch nomeado e commitado, nunca solto.
- `AC-1`: `git status --short --branch` limpo e sem ahead/behind inesperado.
- `AC-2`: `git fsck --connectivity-only` ou alternativa equivalente confirma integridade dos objetos necessários.
- `AC-3`: testes/builds afetados passam ou lacunas são explicitamente registradas.
- `AC-4`: Tester independente emite `ready` para o estado Git final.

## Ordered steps

1. `completed` — FDE definiu política `preservation-first`; Stripe requer comparação e `Landing 2.tsx` permanece desconhecido-preservado.
2. `completed` — Coder fez fetch, inventário, backup e snapshot integral em branch de recuperação.
3. `in_progress` — Coder executa checks técnicos e documenta hashes/refs finais.
4. `pending` — Tester audita recuperabilidade, limpeza, divergência e evidências.
5. `pending` — Main fecha run e entrega mapa claro de branches/PRs.

## Verification strategy

- Comparar árvores e patches por SHA, não apenas mensagens de commit.
- Usar `git range-diff`/`git patch-id` quando históricos divergirem por squash/merge.
- Executar testes focados dos arquivos preservados e build/typecheck se houver mudança de código.
- Confirmar GitHub refs/PRs com `gh`, sem inferir estado pelo cache local.

## Risks and rollback

- Risco principal: perder trabalho local ao alinhar `main`. Mitigação: refs de backup e branch de preservação antes de qualquer operação que mova HEAD/index.
- Risco de objetos lentos/dataless. Mitigação: fetch explícito, `git cat-file` por objeto e clone/worktree auxiliar somente se necessário.
- Rollback: refs `backup/*` apontando para HEAD e commits de preservação contendo mudanças locais classificadas.

## Decisions

- Nenhum `reset --hard`, `git clean`, `checkout -- <file>` ou `pull` automático.
- Não promover/mesclar PR Stripe neste saneamento; apenas deixar o checkout local compreensível e recuperável.
- Gate FDE: antes de mover `main`, criar ref para o HEAD atual e snapshot commit contendo integralmente tracked/untracked; provar equivalência por tree/range-diff/patch-id; manter `Landing 2.tsx` somente na preservação até decisão explícita.

## Classification and provenance

| Arquivos | Classificação | Evidência/ação |
| --- | --- | --- |
| `.env.example`, `apps/api/package.json`, `apps/api/src/{billing,billing.test,plans,plans.test}.ts`, `apps/web/src/pages/{Billing,Billing.test}.tsx`, `apps/web/src/styles.css`, `docs/engineering/auth-billing-benchline-plan.md` | `duplicata-segura` no sentido de promoção; `desconhecido-preservado` como artefato histórico | O worktree local difere do `origin/main`, mas o diff agregado contra o merge remoto remove 456 linhas e inclui a remoção de testes/auth adicionados no PR #5. O `origin/main=e887f51` contém a entrega Stripe mais completa (43 arquivos/7.757 inserções desde o merge-base, contra 41/7.150 da linha local e 267 linhas dirty). Preservado apenas na recovery branch; não promover à `main`. |
| `apps/api/scripts/stripe-bootstrap-{core,,test}.mjs`, `docs/engineering/netolabs-stripe-link-plan.md` | `candidato-valido` não promovido | Ausentes do `origin/main`; tooling/plano local potencialmente útil, mas não faz parte do candidato aprovado. Preservar para triagem futura. |
| `apps/web/src/pages/Landing 2.tsx` | `desconhecido-preservado` | Ausente do remoto e sem provenance suficiente. Preservar integralmente; nenhuma promoção automática. |
| `docs/plans/forge-git-reconciliation-2026-07-14.md` | `candidato-valido` | Plano operacional deste saneamento; versionado junto ao snapshot de recuperação. |

## Reconciliation evidence

- Fetch remoto: `origin/main=e887f51959a1bbf85714346dbe7094bae1be8acf`; PR #5 consta `MERGED` com esse SHA.
- Ref imutável de recuperação da linha local: `backup/forge-main-pre-reconcile-20260714 -> 532939f6f9d3be89fc0025b82560ef452327ff8e`.
- Scan focalizado do diff e dos sete arquivos untracked não encontrou `sk_*`, `rk_*`, `whsec_*`, chave privada ou token GitHub real.
- Os blob hashes de todos os 16 caminhos locais foram registrados no run; nenhum arquivo foi descartado.

## Exit criterion

`main` sincronizada, trabalho adicional em branch/commits próprios, worktree limpo, refs recuperáveis e QA independente `ready`.
