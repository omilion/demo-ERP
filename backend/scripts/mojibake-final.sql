UPDATE clientes.clientes SET nombre =
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(nombre,
    E'\u00C3\u201C', E'\u00D3'),
    E'\u00C3\u008D', E'\u00CD'),
    E'\u00C3\u2030', E'\u00C9'),
    E'\u00C3\u0081', E'\u00C1'),
    E'\u00C3\u0161', E'\u00DA'),
    E'\u00C3\u2018', E'\u00D1'),
    E'\u00C2\u00B0', E'\u00B0'),
    E'\u00C2\u00BA', E'\u00BA'),
    E'\u00E2\u20AC\u0153', '"'),
    E'\u00E2\u20AC\u009D', '"'),
    E'\u00E2\u20AC\u2039', ''),
    E'\u00E2\u20AC\u200B', ''),
    E'\u00E2\u20AC', '"'),
    E'  ', ' '),
    E'\u00C2', '')
WHERE nombre ~ '[\u00C3\u00C2\u00E2]';

SELECT COUNT(*) AS residual FROM clientes.clientes WHERE nombre ~ '[\u00C3\u00C2\u00E2]';
