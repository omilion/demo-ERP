-- Nuevo rol: coordinador_comercial. Mismos permisos que vendedor (backend/src/middleware/rbac.js)
-- salvo por visibilidad CRM ampliada a todos los vendedores (backend/src/routes/crm/index.js).
ALTER TYPE "auth"."Role" ADD VALUE 'coordinador_comercial' AFTER 'vendedor';
