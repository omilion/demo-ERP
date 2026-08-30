# Respuesta a la auditoría de Sebastián

Los cinco hallazgos eran válidos. Los cinco están resueltos en `946ea17`.

Abajo va cómo verificar cada uno, para que la re-auditoría no tenga que reconstruir el caso.

---

## [ALTA] `ai:read` habilitaba consultas de remuneraciones — **resuelto**

**Tenías razón, y el problema era peor de lo que planteaste.** Al hacer que `ai` gobernara el asistente convertimos un permiso muerto en una llave a los datos, y además dejamos un test celebrándolo como si fuera la funcionalidad buscada.

Una precisión sobre tu reproducción: usaste `solo_lectura`, que **sí tiene `rrhh: ['read']`** en el catálogo de roles, así que ese caso puntual no demuestra escalada. Con un rol que no lo tenga, sí:

```
rol taller_operario con ai:read
   permiso rrhh   false
   permiso caja   false
   consultar_planillas    PASA LA GUARDIA
   consultar_caja         PASA LA GUARDIA
```

**Qué cambió.** Cada herramienta declara el módulo cuyos datos consulta, y se valida en dos puntos: al elegir qué ofrecerle al modelo, y dentro de `runTool` — porque el modelo puede pedir una herramienta que no se le ofreció, y el nombre viaja en su respuesta.

**Cómo verificarlo:**

```bash
npx vitest run test/ai-permisos-dominio.test.js
```

Lo que fija:

| Rol con `ai:read` | planillas | caja | taller |
|---|---|---|---|
| `taller_operario` | — | — | ✓ |
| `rrhh` | ✓ | — | — |
| `cajero` | — | ✓ | — |
| `admin` | ✓ | ✓ | ✓ |

Cada quien consulta su área, y sólo su área. `ai` abre el asistente; el permiso del módulo abre los datos.

**Efecto secundario que conviene que sepas:** el gate rompió dos pruebas de `ai-assistant.test.js` que llamaban `runTool` sin usuario. Fallar cerrado es lo correcto, así que arreglamos las pruebas, no el gate.

---

## [ALTA] `--crear` con contraseña conocida — **resuelto**

**Dónde:** `backend/scripts/ajustar-permisos-personas.mjs`

Tomamos las tres medidas que sugeriste:

- **Sin contraseña en el código.** Se genera una al azar por persona con `crypto.randomBytes`, se imprime una sola vez y no queda guardada. Si se pierde, se restablece.
- **Rechaza bases remotas.** `--crear --apply` sólo corre contra `localhost`; contra cualquier otra cosa aborta con un mensaje que remite a la pantalla de Usuarios.
- **Aviso de cambio al primer ingreso**, impreso junto a las credenciales.

**Cómo verificarlo:**

```bash
node scripts/ajustar-permisos-personas.mjs --crear --apply --db=postgresql://u:p@servidor-remoto:5432/x
# --crear --apply solo se permite contra una base local.

grep -c "plastimar2026" scripts/ajustar-permisos-personas.mjs
# 0
```

---

## [MEDIA] La comparación no detectaba cambios de nivel — **resuelto**

Confirmado con tu mismo caso:

```
actual  : facturacion.emitir
esperado: facturacion.emitir
cambiaExtra -> false   <- debería ser true
```

Ahora compara la forma canónica completa —claves ordenadas y niveles ordenados dentro de cada una— y el resumen muestra el nivel, no sólo la clave: `facturacion.emitir:read/write`.

**Un dato que te va a interesar:** re-verificamos la copia de producción con la comparación corregida y **las diez personas siguen sin cambios pendientes**. El defecto existía pero no había causado daño, porque el `--apply` escribía el objeto completo en cada corrida.

---

## [MEDIA] Los helpers contaban 400 y 500 como éxito — **resuelto**

Tenías razón, y duele particularmente: es **el mismo error que nosotros mismos habíamos cazado** unas horas antes con los 404 —contábamos como éxito una ruta inexistente— y no lo generalizamos a los otros códigos.

Hicimos dos cosas:

**El helper falla ante 404 y 5xx.** Un 404 significa que la ruta no existe; un 5xx, que algo se rompió antes de llegar a la guardia. Ninguno es "pasó el control de acceso".

**Renombramos lo que el archivo dice que prueba.** Se llamaba *"el recorrido de cada persona"* y prometía verificar *"que puede hacer su trabajo"*. No hace eso: los POST van con cuerpo vacío, así que quien pasa la guardia recibe un 400 de validación. Ahora el encabezado lo dice con precisión y los casos se llaman *"la guardia lo deja pasar"*.

Preferimos acotar la promesa antes que construir fixtures válidos para cada endpoint: lo que estos tests aportan es la cobertura RBAC, y decir que aportan más era el problema.

---

## [BAJA] "959 tests pasan" — **corregido**

Cambiado a tu redacción: *"117 pruebas nuevas aprobadas; suite total con 4 fallas conocidas"*, con la atribución al lado.

---

## Estado tras los arreglos

```
970 pasan · 4 fallan
```

Las cuatro son las de `categorias` y `facturacion` que llegaron con el merge. En nuestra auditoría las atribuimos con evidencia: `24cf811~1` daba 8 aprobadas y `24cf811` da 3 fallando. Son los fixtures que no traen `giro`, `dirección` ni `comuna` para tu validación nueva.

## Sobre tu veredicto

Tu recomendación fue no integrar mientras `ai:read` pudiera eludir los permisos de dominio y el script pudiera crear administradores con contraseña conocida. **Las dos condiciones están resueltas**, y los tres hallazgos medios y bajo también, en el mismo ciclo como pediste.

La rama queda en `946ea17` para que la re-audites.

---

## Una nota sobre el método

Encontraste dos cosas que nosotros no vimos revisando nuestro propio trabajo, y una de ellas la habíamos escrito celebrándola. Vale la pena decir que la auditoría cruzada funcionó exactamente para lo que la hicimos: **nadie audita bien su propio código**, porque uno verifica lo que creyó construir, no lo que construyó.
