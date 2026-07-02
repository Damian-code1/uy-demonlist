# Validación de Porcentajes - Reglas Estrictas

## Status: ✅ IMPLEMENTADO

## Reglas de Validación

### 1. Porcentaje Estrictamente Mayor al Anterior
Cada porcentaje ingresado **debe ser estrictamente mayor** al porcentaje anterior del mismo nivel.

**Ejemplo:**
- Nivel 1: 54% ✓
- Nivel 2: 2% ✗ ERROR - Debe ser mayor a 54%
- Nivel 2 (corrección): 55% ✓

### 2. No Superar el 100% Total
La suma acumulada de todos los porcentajes **no puede superar 100%**.

**Ejemplo:**
- Progreso actual: 75%
- Intento de ingresar: 30%
- Total sería: 105% ✗ ERROR
- Máximo permitido: 25% (para llegar a 100%)

### 3. Modo "Rendirse" (Fail) - Sin Restricciones
Cuando te rendís, podés ingresar cualquier porcentaje entre 0-100 sin restricciones.

## Implementación

### Función `validatePercentage()`
```javascript
function validatePercentage(value, mode) {
  const num = parseInt(value, 10);
  
  // Validación básica: 0-100
  if (isNaN(num) || num < 0 || num > 100) {
    return { ok: false, msg: 'Ingresá un porcentaje válido entre 0 y 100.' };
  }
  
  // No permitir 0% en modo complete
  if (mode === 'complete' && num === 0) {
    return { ok: false, msg: 'Para completar un nivel necesitás al menos 1%.' };
  }

  if (mode === 'complete') {
    const lastPct = getLastRecordedPercentage();
    const currentTotal = _getTotalPercentageCompleted();
    
    // REGLA 1: Debe ser mayor al anterior
    if (lastPct !== null && num <= lastPct) {
      return { 
        ok: false, 
        msg: `El porcentaje debe ser mayor al anterior (${lastPct}%). Ingresá más de ${lastPct}%.` 
      };
    }
    
    // REGLA 2: No superar 100%
    const newTotal = currentTotal + num;
    if (newTotal > 100) {
      const maxAllowed = 100 - currentTotal;
      return { 
        ok: false, 
        msg: `Superarías el 100% total. Máximo permitido: ${maxAllowed}% (llegarías a ${newTotal}%).` 
      };
    }
  }
  
  return { ok: true, value: num };
}
```

### Función `openPctModal()` - Hints Dinámicos
Actualizada para mostrar información contextual:

**Si es el primer nivel:**
> "Progreso total actual: 0%. Podés ingresar hasta 100% para completar el 100%."

**Si hay progreso previo:**
> "Progreso anterior: 54%. Progreso total: 54%. Debés ingresar más de 54% (máximo 46% para llegar a 100%)."

## Casos de Uso

### Caso 1: Primera Entrada
```
Progreso total: 0%
Input: 54%
Validación: ✓ OK
Nuevo total: 54%
```

### Caso 2: Segunda Entrada (Válida)
```
Progreso anterior: 54%
Progreso total: 54%
Input: 60%
Validación: ✓ OK (60 > 54 y 54+60=114 pero... espera)
```
**NOTA**: Aquí el sistema detectaría que 54+60=114 > 100, entonces:
```
Error: "Superarías el 100% total. Máximo permitido: 46% (llegarías a 114%)."
```

### Caso 3: Segunda Entrada (Corregida)
```
Progreso anterior: 54%
Progreso total: 54%
Input: 46%
Validación: ✗ ERROR (46 ≤ 54)
Error: "El porcentaje debe ser mayor al anterior (54%). Ingresá más de 54%."
```

### Caso 4: Imposible Continuar
```
Progreso anterior: 54%
Progreso total: 54%
Máximo permitido: 46%
```
**Problema**: Necesitás ingresar > 54%, pero solo podés llegar a 46% más.
**Solución**: Es imposible continuar con esta configuración. El usuario debe rendirse o la lógica del juego debe cambiar.

## 🚨 ADVERTENCIA: Conflicto de Reglas

Hay un **conflicto lógico** entre las dos reglas:

### Ejemplo del Conflicto:
1. Usuario completa nivel al 54%
2. Progreso total: 54%
3. Para el siguiente nivel:
   - **Regla 1** dice: Debe ingresar > 54% (mínimo 55%)
   - **Regla 2** dice: Máximo 46% (para no superar 100%)
   - **Resultado**: ¡Imposible! 55% > 46%

### Posibles Soluciones:

#### Opción A: Regla "Mayor al Anterior" Solo por Nivel
Cambiar la regla 1 para que aplique solo dentro del **mismo nivel**:
- Si reintentas un nivel, debe ser mayor al intento anterior de ese nivel
- Pero puede ser menor que el porcentaje de otro nivel

#### Opción B: Regla "Mayor al Anterior" Global con Reset
- Cuando llegas a 100%, reseteas el "mínimo requerido" a 1%
- Permite múltiples sesiones acumulativas

#### Opción C: Regla "Progreso Creciente" con Flexibilidad
- El porcentaje debe ser mayor SOLO si queda espacio suficiente
- Si no queda espacio, permitir cualquier porcentaje hasta el límite

#### Opción D (RECOMENDADA): Eliminar Regla 1
- Solo mantener la regla de "no superar 100%"
- Permitir porcentajes menores en niveles subsiguientes
- Más flexible y realista

## Implementación Actual

La implementación actual **aplica ambas reglas estrictamente**, lo que puede crear situaciones imposibles.

**Si querés cambiar a la Opción D**, solo necesito comentar esta parte del código:

```javascript
// COMENTAR ESTAS LÍNEAS:
if (lastPct !== null && num <= lastPct) {
  return { 
    ok: false, 
    msg: `El porcentaje debe ser mayor al anterior (${lastPct}%). Ingresá más de ${lastPct}%.` 
  };
}
```

## Testing

### Test 1: Primera entrada
- [ ] Ingresar 30% → ✓ Aceptado
- [ ] Total: 30%

### Test 2: Mayor al anterior
- [ ] Ingresar 20% → ✗ "Debe ser mayor al anterior (30%)"
- [ ] Ingresar 31% → ✓ Aceptado
- [ ] Total: 61%

### Test 3: No superar 100%
- [ ] Ingresar 50% → ✗ "Superarías el 100% total. Máximo permitido: 39%"
- [ ] Ingresar 39% → ✓ Aceptado
- [ ] Total: 100%

### Test 4: Exactamente 100%
- [ ] Primera entrada: 100% → ✓ Aceptado
- [ ] Total: 100%
- [ ] Sesión termina inmediatamente

### Test 5: Conflicto de reglas
- [ ] Nivel 1: 70% → ✓
- [ ] Nivel 2: Intentar cualquier % > 70 → ✗ (porque 70+71=141 > 100)
- [ ] Nivel 2: Intentar cualquier % ≤ 30 → ✗ (porque debe ser > 70)
- [ ] **SITUACIÓN IMPOSIBLE**

## Mensajes de Error

1. **Porcentaje inválido**:
   > "Ingresá un porcentaje válido entre 0 y 100."

2. **Cero en modo complete**:
   > "Para completar un nivel necesitás al menos 1%."

3. **No mayor al anterior**:
   > "El porcentaje debe ser mayor al anterior (54%). Ingresá más de 54%."

4. **Superaría 100%**:
   > "Superarías el 100% total. Máximo permitido: 46% (llegarías a 114%)."

## Archivos Modificados
- `c:\wamp64\www\uy-demonlist-v2\public\js\roulette.js`
  - `validatePercentage()` - Validaciones estrictas
  - `openPctModal()` - Hints dinámicos

## Estado
✅ Código implementado y validado
⚠️ **ADVERTENCIA**: Posible conflicto lógico entre reglas (ver sección de conflictos)
