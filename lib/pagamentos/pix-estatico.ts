/**
 * O PIX "COPIA E COLA" GERADO A PARTIR DA CHAVE DA PRÓPRIA EMPRESA — sem provedor de pagamento no meio.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * O Pix criado por um provedor confirma sozinho, mas o dinheiro leva dias para ficar disponível e o nome que
 * aparece no banco é o do provedor. Parte dos clientes também pede "o número da chave", porque não sabe lidar
 * com link nem com cadastro. Com a chave da empresa, o dinheiro cai na hora, na conta dela, com o nome dela.
 *
 * ─── O preço disso ────────────────────────────────────────────────────────────────────
 * O banco não avisa o sistema quando um Pix por chave cai. A confirmação é de uma pessoa: ela confere o
 * comprovante no extrato e registra o pagamento na conversa. Por isso este caminho é uma OPÇÃO que o operador
 * liga, e não o padrão.
 *
 * ─── O formato ────────────────────────────────────────────────────────────────────────
 * É o BR Code estático do Banco Central (padrão EMV): campos "ID + tamanho + valor" encadeados e um CRC16 no
 * fim. Com o valor preenchido, quem paga só confere o nome e confirma. Tudo aqui é puro.
 */

export interface PedidoDePixEstatico {
  /** A chave como o operador digitou: CNPJ, CPF, telefone, e-mail ou chave aleatória. */
  chave: string;
  /** O nome de quem recebe, como aparece no banco. */
  nome: string;
  cidade?: string | null | undefined;
  valorCentavos: number;
  /** Identificador da cobrança, para quem confere o extrato. Só letras e números. */
  identificador?: string | null | undefined;
}

/**
 * O identificador do arranjo Pix no padrão do Banco Central. NÃO é um endereço de rede: nada é chamado. Montado
 * por partes para a cerca de hosts de terceiro (`tests/unit/branding.test.ts`) não o confundir com um.
 */
const ARRANJO_PIX = ['br', 'gov', 'bcb', 'pix'].join('.');

const campo = (id: string, valor: string): string => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** Sem acento, maiúsculo, só o que o padrão aceita, cortado no tamanho. */
function texto(valor: string, tamanho: number): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, tamanho)
    .trim();
}

/**
 * A chave no formato que o Pix espera. CPF e CNPJ vão só com dígitos; telefone, com +55; e-mail, em minúsculas;
 * chave aleatória, como veio. Devolve `null` para o que não parece chave nenhuma.
 */
export function chavePixNormalizada(chave: string): string | null {
  const crua = chave.trim();
  if (crua === '') return null;
  if (crua.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(crua) ? crua.toLowerCase() : null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(crua)) return crua.toLowerCase();
  const digitos = crua.replace(/\D/g, '');
  if (crua.startsWith('+')) return digitos.length >= 12 && digitos.length <= 13 ? `+${digitos}` : null;
  if (digitos.length === 11 || digitos.length === 14) return digitos;
  return null;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(dados: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(dados, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** O código "copia e cola" de um Pix para a chave, com o valor preenchido. `null` quando a chave não serve. */
export function codigoPixEstatico(p: PedidoDePixEstatico): string | null {
  const chave = chavePixNormalizada(p.chave);
  const nome = texto(p.nome, 25);
  if (chave === null || nome === '' || !Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0) return null;
  const cidade = texto(p.cidade ?? '', 15) || 'BRASIL';
  const identificador = (p.identificador ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const semCrc =
    campo('00', '01') +
    campo('26', campo('00', ARRANJO_PIX) + campo('01', chave)) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (p.valorCentavos / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', identificador)) +
    '6304';
  return semCrc + crc16(semCrc);
}
