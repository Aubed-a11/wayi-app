// Numéros Mobile Money du Bénin (format à 10 chiffres, commençant par 01) → "+229XXXXXXXXXX".
// Accepte "01 42 43 63 87", "+229 01 42 43 63 87", "229 0142436387" ou l'ancien format à 8 chiffres.
function normalizeBeninMomo(input) {
  if (input === undefined || input === null) return undefined; // pas fourni : ne rien changer
  const raw = String(input).trim();
  if (!raw) return null; // vide : effacer
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00229')) d = d.slice(5);
  else if (d.startsWith('229') && d.length > 10) d = d.slice(3);
  if (d.length === 8) d = '01' + d;
  if (!/^01\d{8}$/.test(d)) return false; // invalide
  return '+229' + d;
}
module.exports = { normalizeBeninMomo };
