# Módulo de Clientes

## Qué es
Permite registrar y administrar a las empresas e instituciones que compran en Plastimar, centralizando sus sucursales, contactos y límites de crédito.

## Dónde está
Ruta: Menú **Ventas → Clientes** (`/clientes`).

## Cómo hago lo principal

### Registrar un nuevo cliente
1. Ve a **Clientes** y haz clic en **Nuevo Cliente**.
2. Completa el RUT (identificador único canónico). El sistema valida que no existan RUTs duplicados en el ERP.
3. Completa el Nombre comercial, Razón Social, Giro y datos de contacto principales.
4. Define el límite de crédito si corresponde (dejar en 0 para no otorgar crédito).
5. Haz clic en **Guardar**.

### Agregar sucursales y presupuestos (Multi-sucursales)
1. Para clientes grandes como **Fundación Integra, JUNJI o el Instituto Nacional de Deportes (IND)**, que usan un único RUT comercial pero compran desde distintas comunas, debes registrar sus sucursales.
2. Abre la ficha del cliente y ve a la sección de **Sucursales**.
3. Haz clic en **Agregar Sucursal** e ingresa la dirección, región, comuna y un identificador de presupuesto asignado si aplica.
4. Al crear una venta, podrás seleccionar exactamente a cuál de estas sucursales dirigir el despacho.

### Marcar a un cliente como conflictivo
1. Si un cliente presenta problemas recurrentes de pago, maltrato o comportamiento dudoso, abre su ficha y haz clic en **Editar**.
2. Activa la opción **Cliente Conflictivo** e ingresa una justificación detallada de los motivos.
3. Al guardar, aparecerá un ícono de advertencia amarillo ⚠ en la Matriz de Ventas al lado del nombre de este cliente para alertar a los vendedores antes de tomar un nuevo pedido.

## Campos importantes
- **RUT Canónico:** Identificador fiscal único de la empresa. No se permiten duplicados.
- **Cliente Conflictivo:** Alerta visual que se propaga a todo el ERP.
- **Límite de Crédito:** Monto máximo que el cliente puede adeudar antes de bloquear nuevas ventas automáticas.

## Preguntas frecuentes
- **¿Por qué me dice que el RUT ya existe?** El sistema prohíbe duplicar clientes. Busca el RUT en la barra de búsqueda general del módulo para ver si ya fue registrado por otra ejecutiva.
- **¿Cómo borro a un cliente?** En lugar de borrarlo, puedes editar su estado y marcarlo como "Inactivo" para conservar su historial de facturación de forma íntegra.
