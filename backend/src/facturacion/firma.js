// Firma electrónica para DTE: carga del certificado digital (.p12/.pfx) y
// firma XMLDSIG (RSA-SHA1, C14N, transform enveloped) según exige el SII.
//
// Los XML de este módulo se generan ya en forma canónica (ver xmlUtil.js), por
// lo que el digest se calcula directamente sobre el string generado. El SII
// canonicaliza en UTF-8 aunque el archivo viaje en ISO-8859-1: los digests y
// firmas se computan sobre bytes UTF-8; sólo la serialización final es latin1.

import crypto from 'node:crypto';
import fs from 'node:fs';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

export const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

export const loadCertificate = (p12Path, password) => {
  const der = fs.readFileSync(p12Path, 'binary');
  const asn1 = forge.asn1.fromDer(der);
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    throw new Error(`No se pudo abrir el certificado: contraseña incorrecta o formato no soportado (${err.message}).`);
  }

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (!keyBags || !keyBags.length || !certBags || !certBags.length) {
    throw new Error('El certificado no contiene llave privada y certificado X509.');
  }

  const privateKey = keyBags[0].key;
  // El bag puede traer la cadena completa; el certificado del titular es el
  // que corresponde a la llave privada (mismo módulo RSA).
  const cert = certBags.map(bag => bag.cert).find(c => c && c.publicKey
    && c.publicKey.n.toString(16) === privateKey.n.toString(16)) || certBags[0].cert;

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certPem = forge.pki.certificateToPem(cert);
  const certDerB64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  );

  const bigIntToB64 = (bigInt) => {
    let hex = bigInt.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    // C14N de KeyValue usa el entero sin byte de signo inicial
    if (hex.startsWith('00')) hex = hex.slice(2);
    return forge.util.encode64(forge.util.hexToBytes(hex));
  };

  // RUT del titular: extensión chilena OID 1.3.6.1.4.1.8321.1 en subjectAltName
  let rutTitular = null;
  try {
    const altName = cert.getExtension('subjectAltName');
    if (altName && altName.altNames) {
      for (const name of altName.altNames) {
        if (name.value && /^\d{6,9}-?[\dkK]$/.test(String(name.value).trim())) {
          rutTitular = String(name.value).trim().toUpperCase();
        }
      }
    }
  } catch { /* extensión opcional */ }

  return {
    privateKeyPem,
    certPem,
    certDerB64,
    modulusB64: bigIntToB64(privateKey.n),
    exponentB64: bigIntToB64(privateKey.e),
    subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    rutTitular
  };
};

export const sha1B64 = (input) => crypto.createHash('sha1').update(input).digest('base64');

export const rsaSha1B64 = (input, privateKeyPem) => crypto.createSign('RSA-SHA1')
  .update(input)
  .sign(privateKeyPem)
  .toString('base64');

const wrapB64 = (b64, width = 76) => b64.replace(new RegExp(`(.{${width}})`, 'g'), '$1\n').trim();

// Firma un elemento XML usando xml-crypto para asegurar canonicalización (C14N 1.0)
// y herencia correcta de namespaces compatible con el SII.
// Devuelve el bloque <Signature> como string para mantener compatibilidad SOAP y de ensamblado.
export const signXml = (xmlString, referenceUri, cert, options = {}) => {
  const sig = new SignedXml();
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

  const transformAlgorithm = options.transformAlgorithm || 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

  let xpathQuery = '/*';
  if (referenceUri && referenceUri.startsWith('#')) {
    const id = referenceUri.substring(1);
    xpathQuery = `//*[@*[local-name(.)='ID' or local-name(.)='id']='${id}']`;
  }

  const isEmpty = (referenceUri === '');
  sig.addReference({
    xpath: xpathQuery,
    transforms: [transformAlgorithm],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: referenceUri,
    isEmptyUri: isEmpty
  });

  sig.privateKey = cert.privateKeyPem;
  sig.getKeyInfo = function(prefix) {
    const currentPrefix = prefix ? `${prefix}:` : '';
    return `<${currentPrefix}KeyInfo>`
      + `<${currentPrefix}KeyValue>`
      + `<${currentPrefix}RSAKeyValue>`
      + `<${currentPrefix}Modulus>${wrapB64(cert.modulusB64)}</${currentPrefix}Modulus>`
      + `<${currentPrefix}Exponent>${cert.exponentB64}</${currentPrefix}Exponent>`
      + `</${currentPrefix}RSAKeyValue>`
      + `</${currentPrefix}KeyValue>`
      + `<${currentPrefix}X509Data>`
      + `<${currentPrefix}X509Certificate>${wrapB64(cert.certDerB64)}</${currentPrefix}X509Certificate>`
      + `</${currentPrefix}X509Data>`
      + `</${currentPrefix}KeyInfo>`;
  };

  sig.computeSignature(xmlString, {
    location: {
      reference: '/*',
      action: 'append'
    }
  });

  return sig.signatureXml;
};
