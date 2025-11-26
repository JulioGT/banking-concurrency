# Isolation Levels en PostgreSQL

## Niveles Disponibles

### 1. READ UNCOMMITTED

**PostgreSQL:** Tratado como READ COMMITTED (no implementado realmente)

- ❌ Permite dirty reads
- ❌ Permite non-repeatable reads
- ❌ Permite phantom reads
- ✅ Performance máximo

**Cuándo usar:** Nunca en este proyecto (no seguro para finanzas)

---

### 2. READ COMMITTED (DEFAULT)

**PostgreSQL:** Default y más usado

- ✅ Previene dirty reads
- ❌ Permite non-repeatable reads
- ❌ Permite phantom reads
- ✅ Buen performance

**Cuándo usar:**

- ✅ Operaciones de escritura (deposit, withdraw)
- ✅ Queries simples de lectura
- ✅ Mayoría de los casos

**Ejemplo:**

```typescript
await txHelper.executeInTransaction(async (client) => {
  // Si otra transacción modifica la cuenta mientras corremos esto,
  // veremos el cambio en la segunda query
  const account1 = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
  // ... otra transacción hace UPDATE ...
  const account2 = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
  // account1.balance puede ser diferente de account2.balance
}, 'READ COMMITTED');
```

---

### 3. REPEATABLE READ

**PostgreSQL:** Snapshot al inicio de la transacción

- ✅ Previene dirty reads
- ✅ Previene non-repeatable reads
- ⚠️ Previene phantom reads (PostgreSQL implementación específica)
- ⚠️ Performance medio

**Cuándo usar:**

- ✅ Reportes que necesitan snapshot consistente
- ✅ Generación de estados de cuenta
- ✅ Análisis de múltiples cuentas

**Ejemplo:**

```typescript
await txHelper.executeInTransaction(async (client) => {
  // Snapshot al inicio de la transacción
  const account1 = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
  // ... otra transacción hace UPDATE ...
  const account2 = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
  // account1.balance === account2.balance (mismo snapshot)
}, 'REPEATABLE READ');
```

---

### 4. SERIALIZABLE

**PostgreSQL:** Emula ejecución serial (SSI - Serializable Snapshot Isolation)

- ✅ Previene dirty reads
- ✅ Previene non-repeatable reads
- ✅ Previene phantom reads
- ❌ Performance bajo (puede lanzar serialization errors)

**Cuándo usar:**

- ⚠️ Solo casos extremadamente críticos
- ⚠️ No necesario en este proyecto (optimistic locking es suficiente)

**Ejemplo:**

```typescript
await txHelper.executeInTransaction(async (client) => {
  // Si hay conflicto con otra transacción, PostgreSQL lanza error
  // Error: could not serialize access due to concurrent update
}, 'SERIALIZABLE');
```

---

## Recomendaciones para Este Proyecto

| Operación                  | Isolation Level | Razón                                      |
| -------------------------- | --------------- | ------------------------------------------ |
| Deposit/Withdraw           | READ COMMITTED  | Optimistic locking ya maneja concurrencia  |
| Get Balance                | READ COMMITTED  | Lectura simple, no necesita snapshot       |
| Get Account + Transactions | REPEATABLE READ | Snapshot consistente de cuenta + historial |
| Generate Statement         | REPEATABLE READ | Reportes necesitan consistencia            |
| Health Check               | READ COMMITTED  | No crítico                                 |

---

## Performance vs Consistencia

```
READ COMMITTED      REPEATABLE READ     SERIALIZABLE
      ↓                    ↓                  ↓
  ⚡ Rápido           ⚡ Medio           🐌 Lento
  ⚠️ Menos            ✅ Más            ✅ Máxima
     consistencia        consistencia       consistencia
```

**Regla de oro:**

> "Usa el nivel de aislamiento MÁS BAJO que garantice la consistencia que necesitas"

```

---

## ✅ CHECKPOINT FASE 4

**Verifica que funciona:**

- [ ] ✅ `src/utils/transaction-helper.ts` creado
- [ ] ✅ Tests unitarios pasan (7/7)
- [ ] ✅ Endpoint GET /accounts/:id usa el helper
- [ ] ✅ `curl` retorna cuenta + transacciones
- [ ] ✅ Documentación de isolation levels creada
- [ ] ✅ No hay errores de TypeScript

---

## 🎯 RESUMEN FASE 4

**Archivos creados:**
```

src/utils/
└── transaction-helper.ts # ✅ Helper con BEGIN/COMMIT/ROLLBACK

tests/unit/
└── transaction-helper.test.ts # ✅ 7 tests unitarios

docs/
└── isolation-levels.md # ✅ Documentación

src/routes/accounts.ts # ✅ Actualizado con ejemplo de uso
