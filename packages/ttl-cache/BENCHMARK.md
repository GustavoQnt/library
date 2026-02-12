# Benchmark — @GustavoQnt/ttl-cache

Instruções para rodar os benchmarks de performance.

## Rodando os Benchmarks

### Pré-requisitos
- Node.js 18+
- `pnpm` instalado
- Dependências do projeto instaladas (`pnpm install`)

### Comando 1: Rodar benchmarks uma vez (rápido)

```bash
cd packages/ttl-cache
pnpm run bench
```

Ou da raiz:

```bash
pnpm -F @GustavoQnt/ttl-cache run bench
```

### Comando 2: Rodar benchmarks com watch mode (desenvolver)

```bash
cd packages/ttl-cache
pnpm run bench:watch
```

Isso ativa watch mode do Vitest — roda benchmarks toda vez que você salva o arquivo.

### Comando 3: Rodar testes + benchmarks

```bash
pnpm test
```

(Isso roda testes normais. Para ver benchmarks, use `pnpm bench`)

---

## O que cada benchmark mede

| Benchmark | Descrição |
|-----------|-----------|
| `set 10k entries` | **Throughput** de `set()` — quão rápido popular 10.000 entries |
| `get 10k entries (all hits)` | **Throughput** de `get()` — quão rápido fazer 10k lookups com 100% hits |
| `set + get mixed (10k ops)` | **Mixed workload** — 5k sets + 5k gets, mais realista |
| `LRU eviction (set 20k into maxSize 10k)` | **LRU overhead** — inserir 20k em um cache com maxSize 10k (força eviction) |
| `set + get 100k entries` | **Stress test** — escala maior (100k ops) |

---

## Entendendo o Output

Exemplo de output:

```
 ✓ packages/ttl-cache/test/performance.bench.ts > TtlCache benchmarks (2478ms)
     name                                   hz      min      max     mean     p75     p99    p995    p999     rme    samples
   · set 10k entries                    669.31   0.9964   4.3674   1.4941   1.6458  3.3223  4.1763  4.3674  ±3.89%      335
   · get 10k entries (all hits)         450.86   1.6154   5.1510   2.2180   2.3558  4.3913  4.5845  5.1510  ±3.32%      226
   · set + get mixed (10k ops)          934.67   0.7433   8.8700   1.0699   1.0462  3.3071  5.8979  8.8700  ±5.09%      469
   · LRU eviction (set 20k into 10k)    282.90   2.5669   7.7473   3.5348   3.8851  7.5197  7.7473  7.7473  ±4.87%      142
   · set + get 100k entries              …
```

### Colunas

- **hz**: Operações por segundo (maior = melhor)
- **min/max**: Tempo mínimo e máximo por operação (em ms)
- **mean**: Tempo médio por operação
- **p75/p99**: Percentis — tempo levado por 75% e 99% das operações
- **rme**: Relative Margin of Error (±%) — quanto os resultados variam
- **samples**: Quantas vezes o benchmark rodou

### Interpretação

- `set 10k entries: 669.31 hz` = consegue fazer ~669 operações de set de 10k por segundo
  - Ou seja: **~6.6 μs por set** (1.000.000 / 669 / 10000)
- `rme ±3.89%` = os resultados têm variação de ±3.89% (bom — < 5%)

---

## Rodando um benchmark específico

Se quer rodar **apenas um** benchmark:

```bash
npx vitest bench packages/ttl-cache/test/performance.bench.ts -t "set 10k"
```

---

## Comparando Resultados

Se quer comparar com `lru-cache` ou outra lib:

### 1. Instale a lib para comparação

```bash
npm install lru-cache
```

### 2. Crie um arquivo `lru-cache.bench.ts` na pasta `test/`

```typescript
import { bench, describe } from 'vitest';
import LRUCache from 'lru-cache';

describe('lru-cache benchmarks', () => {
  bench('set 10k entries', () => {
    const cache = new LRUCache({ max: 10_000 });
    for (let i = 0; i < 10_000; i++) {
      cache.set(i, i);
    }
  });

  bench('get 10k entries (all hits)', () => {
    const cache = new LRUCache({ max: 10_000 });
    for (let i = 0; i < 10_000; i++) {
      cache.set(i, i);
    }
    for (let i = 0; i < 10_000; i++) {
      cache.get(i);
    }
  });
});
```

### 3. Rode o benchmark

```bash
pnpm bench
```

Vitest vai rodar ambos os suites de benchmarks e você consegue comparar!

---

## Configuração dos Benchmarks

Os benchmarks usam `vitest --run` com configuração default. Para customizar:

Edite `vitest.config.ts` na raiz:

```typescript
export default defineConfig({
  test: {
    benchmark: {
      include: ['**/performance.bench.ts'],
      iterations: 100, // quantas vezes rodar
      // ...
    },
  },
});
```

Ver mais em: https://vitest.dev/api/#bench

---

## Troubleshooting

### "Benchmark é muito lento"

Os benchmarks rodam muitas operações. Se estiver lento:
- Edite o benchmark e reduza números (ex: 10k → 1k)
- Use `-t` flag para rodar apenas um benchmark específico

### "Resultado é inconsistente"

Isso é normal! Variações acontecem por:
- Garbage collection
- Variações no CPU scheduling
- Outros processos rodando

A coluna `rme` mostra a variação. Se `rme > 10%`, considere:
- Aumentar `iterations` em `vitest.config.ts`
- Rodar em uma máquina mais idle

---

## Mais Informações

- [Vitest Benchmark API](https://vitest.dev/api/#bench)
- [How to write good benchmarks](https://esbuild.github.io/api/#benchmark)
