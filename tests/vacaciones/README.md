# Pruebas del módulo de Vacaciones

Desde la raíz del proyecto:

```bash
node --test tests/vacaciones/vacationWorkSchedule.test.js tests/vacaciones/vacationDateRules.test.js tests/vacaciones/vacationCalendarEvents.test.js
```

No requieren instalar Jest, Vitest ni ninguna dependencia adicional: usan el runner `node:test` incluido en Node 22.
