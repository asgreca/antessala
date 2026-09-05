/**
 * Utilitário de Resolução de Logos e Identidade Visual de Entidades Externas
 * Mapeia empresas, associações de classe, confederações, ONGs, movimentos sociais,
 * institutos de pesquisa, sindicatos, parceiras multinacionais e concessionárias
 * para seus domínios web e provedores de CDN de alta resolução.
 */

export type EntityCategory = 'company' | 'association' | 'confederation' | 'ngo' | 'foundation' | 'union' | 'legal';

const KNOWN_DOMAINS: Record<string, string> = {
  // --- PETRÓLEO, ENERGIA, MINERAÇÃO & SIDERURGIA ---
  petrobras: 'petrobras.com.br',
  'petroleo brasileiro': 'petrobras.com.br',
  transpetro: 'transpetro.com.br',
  vale: 'vale.com',
  shell: 'shell.com.br',
  'shell brasil': 'shell.com.br',
  vibra: 'vibraenergia.com.br',
  'vibra energia': 'vibraenergia.com.br',
  ipiranga: 'ipiranga.com.br',
  raizen: 'raizen.com.br',
  eletrobras: 'eletrobras.com',
  neoenergia: 'neoenergia.com',
  energisa: 'energisa.com.br',
  equatorial: 'equatorialenergia.com.br',
  cpfl: 'cpfl.com.br',
  'cpfl energia': 'cpfl.com.br',
  enel: 'enel.com.br',
  light: 'light.com.br',
  copel: 'copel.com',
  cemig: 'cemig.com.br',
  eneva: 'eneva.com.br',
  equinor: 'equinor.com',
  totalenergies: 'totalenergies.com.br',
  tag: 'tag-gas.com',
  nts: 'ntsbrasil.com',
  braskem: 'braskem.com',
  gerdau: 'gerdau.com',
  ultragaz: 'ultragaz.com.br',
  'origem energia': 'origemenergia.com',
  'casa dos ventos': 'casadosventos.com.br',
  edp: 'edp.com.br',
  suzano: 'suzano.com.br',
  klabin: 'klabin.com.br',
  prio: 'prio3.com.br',
  'brava energia': 'bravaenergia.com.br',

  // --- MULTINACIONAIS AFRETADORAS & OFFSHORE ---
  modec: 'modec.com',
  yinson: 'yinson.com',
  sbm: 'sbmoffshore.com',
  'sbm offshore': 'sbmoffshore.com',
  misc: 'miscgroup.com',
  valaris: 'valaris.com',
  transocean: 'deepwater.com',
  'subsea 7': 'subsea7.com',
  technip: 'technipenergies.com',
  noble: 'noblecorp.com',

  // --- TELECOMUNICAÇÕES, TECNOLOGIA, MÍDIA & PUBLICIDADE ---
  telefonica: 'telefonica.com.br',
  vivo: 'vivo.com.br',
  claro: 'claro.com.br',
  tim: 'tim.com.br',
  oi: 'oi.com.br',
  'oi net': 'oi.com.br',
  algar: 'algartelecom.com.br',
  'algar telecom': 'algartelecom.com.br',
  brisanet: 'brisanet.com.br',
  alloha: 'alloha.com',
  sky: 'sky.com.br',
  microsoft: 'microsoft.com',
  google: 'google.com',
  amazon: 'amazon.com.br',
  aws: 'aws.amazon.com',
  huawei: 'huawei.com',
  apple: 'apple.com',
  meta: 'meta.com',
  facebook: 'meta.com',
  'facebook servicos online': 'meta.com',
  whatsapp: 'meta.com',
  uber: 'uber.com',
  ifood: 'ifood.com.br',
  cielo: 'cielo.com.br',
  sejadigital: 'sejadigital.com.br',
  'seja digital': 'sejadigital.com.br',
  gartner: 'gartner.com',
  mckinsey: 'mckinsey.com',
  accenture: 'accenture.com',
  stefanini: 'stefanini.com',
  totvs: 'totvs.com',
  g4f: 'g4f.com.br',
  gauge: 'gauge.com.br',
  calia: 'caliay2.com.br',
  'calia y2': 'caliay2.com.br',

  // --- AVIAÇÃO, RODOVIAS, FERROVIAS & LOGÍSTICA ---
  embraer: 'embraer.com',
  eve: 'eveairmobility.com',
  azul: 'voeazul.com.br',
  'azul linhas aereas': 'voeazul.com.br',
  gol: 'voegol.com.br',
  'gol linhas aereas': 'voegol.com.br',
  latam: 'latamairlines.com',
  boeing: 'boeing.com',
  airbus: 'airbus.com',
  vli: 'vli-logistica.com.br',
  'vli logistica': 'vli-logistica.com.br',
  rumo: 'rumolog.com',
  'rumo logistica': 'rumolog.com',
  mrs: 'mrs.com.br',
  'mrs logistica': 'mrs.com.br',
  transnordestina: 'tlsa.com.br',
  arteris: 'arteris.com.br',
  ecorodovias: 'ecorodovias.com.br',
  ccr: 'grupoccr.com.br',
  'grupo ccr': 'grupoccr.com.br',
  'ccr rodovias': 'grupoccr.com.br',
  'ccr riosp': 'ccrriosp.com.br',
  riosp: 'ccrriosp.com.br',
  fraport: 'fraport-brasil.com',
  vinci: 'vinci-airports.com',
  'vinci airports': 'vinci-airports.com',
  viracopos: 'viracopos.com',
  motiva: 'motivamobilidade.com.br',
  triunfo: 'triunfo.com',
  'rota do oeste': 'rotadooeste.com.br',
  'via brasil': 'viabrasilhbr.com.br',
  viabahia: 'viabahia.com.br',
  'ecovias do araguaia': 'ecoviasdoaraguaia.com.br',
  epr: 'eprvias.com.br',
  'nova 381': 'concessionarianova381.com.br',

  // --- SETOR FINANCEIRO, BANCOS & MERCADO DE CAPITAIS ---
  itau: 'itau.com.br',
  'itau unibanco': 'itau.com.br',
  bradesco: 'bradesco.com.br',
  santander: 'santander.com.br',
  'banco do brasil': 'bb.com.br',
  caixa: 'caixa.gov.br',
  'caixa economica federal': 'caixa.gov.br',
  bndes: 'bndes.gov.br',
  'banco nacional de desenvolvimento economico e social': 'bndes.gov.br',
  'banco do nordeste': 'bnb.gov.br',
  bnb: 'bnb.gov.br',
  btg: 'btgpactual.com',
  'btg pactual': 'btgpactual.com',
  b3: 'b3.com.br',
  xp: 'xpi.com.br',
  'xp investimentos': 'xpi.com.br',
  citibank: 'citibank.com.br',
  citi: 'citibank.com.br',
  nubank: 'nubank.com.br',
  inter: 'inter.co',
  safra: 'safra.com.br',
  ndb: 'ndb.int',
  'terra investimentos': 'terrainvestimentos.com.br',

  // --- AGRO, ALIMENTOS & FARMACÊUTICO ---
  jbs: 'jbs.com.br',
  marfrig: 'marfrig.com.br',
  amaggi: 'amaggi.com.br',
  bayer: 'bayer.com.br',
  basf: 'basf.com',
  syngenta: 'syngenta.com.br',
  cargill: 'cargill.com.br',
  bunge: 'bunge.com.br',
  janssen: 'janssen.com',
  'janssen cilag': 'janssen.com',
  'janssen-cilag': 'janssen.com',
  'novo nordisk': 'novonordisk.com.br',
  novonordisk: 'novonordisk.com.br',
  sanofi: 'sanofi.com.br',
  'edwards lifesciences': 'edwards.com',
  edwards: 'edwards.com',
  'reckitt benckiser': 'reckitt.com',
  reckitt: 'reckitt.com',
  eurofarma: 'eurofarma.com.br',
  ems: 'ems.com.br',
  ache: 'ache.com.br',
  hypera: 'hypera.com.br',
  cristalia: 'cristalia.com.br',
  astrazeneca: 'astrazeneca.com.br',
  pfizer: 'pfizer.com.br',
  novartis: 'novartis.com.br',
  roche: 'roche.com.br',
  gsk: 'gsk.com',
  merck: 'merck.com.br',
  abbott: 'abbottbrasil.com.br',
  takeda: 'takeda.com',
  boehringer: 'boehringer-ingelheim.com',

  // --- SERVIÇOS DIGITAIS, PLATAFORMAS & TELECOM ADICIONAIS ---
  airbnb: 'airbnb.com.br',
  'airbnb plataforma digital': 'airbnb.com.br',
  datora: 'datora.net',
  'datora telecomunicacoes': 'datora.net',
  'surf telecom': 'surftelecom.com.br',
  surf: 'surftelecom.com.br',
  sercomtel: 'sercomtel.com.br',
  nidec: 'nidec.com',
  'nidec global': 'nidec.com',
  spal: 'femsa.com',
  femsa: 'femsa.com',
  concremat: 'concremat.com.br',
  fsb: 'fsb.com.br',
  voltalia: 'voltalia.com',
  byd: 'byd.com.br',
  toyota: 'toyota.com.br',

  // --- ASSOCIAÇÕES SETORIAIS & ENTIDADES DE CLASSE ---
  unica: 'unica.com.br',
  abrace: 'abrace.org.br',
  'abrace energia': 'abrace.org.br',
  abradee: 'abradee.org.br',
  conexis: 'conexis.org.br',
  anbima: 'anbima.com.br',
  febraban: 'febraban.org.br',
  anfavea: 'anfavea.com.br',
  abear: 'abear.com.br',
  antf: 'antf.org.br',
  abiquim: 'abiquim.org.br',
  abiove: 'abiove.org.br',
  abcr: 'abcr.org.br',
  absolar: 'absolar.org.br',
  abeeolica: 'abeeolica.org.br',
  abrate: 'abrate.org.br',
  abraceel: 'abraceel.com.br',
  brasscom: 'brasscom.org.br',
  telcomp: 'telcomp.org.br',
  abrint: 'abrint.com.br',
  'abr telecom': 'abrtelecom.com.br',
  farmabrasil: 'farmabrasil.org.br',
  'grupo farmabrasil': 'farmabrasil.org.br',
  interfarma: 'interfarma.org.br',
  sindigas: 'sindigas.org.br',
  moveinfra: 'moveinfra.org.br',
  abimaq: 'abimaq.org.br',
  abinee: 'abinee.org.br',
  abert: 'abert.org.br',
  fenasaude: 'fenasaude.org.br',
  'federacao nacional de saude suplementar': 'fenasaude.org.br',
  andifes: 'andifes.org.br',
  embrapii: 'embrapii.org.br',
  eace: 'eace.org.br',
  'eace - conectividade de escolas': 'eace.org.br',
  eaf: 'eaf.org.br',
  ibp: 'ibp.org.br',
  'ibp - instituto brasileiro de petroleo e gas': 'ibp.org.br',
  'instituto brasileiro de petroleo': 'ibp.org.br',
  postalis: 'postalis.org.br',
  ocb: 'somoscooperativismo.coop.br',
  'organizacao das cooperativas brasileiras': 'somoscooperativismo.coop.br',

  // --- CONFEDERAÇÕES NACIONAIS ---
  cni: 'portaldaindustria.com.br',
  'confederacao nacional da industria': 'portaldaindustria.com.br',
  cnt: 'cnt.org.br',
  'confederacao nacional do transporte': 'cnt.org.br',
  cnc: 'portaldocomercio.org.br',
  'confederacao nacional do comercio': 'portaldocomercio.org.br',
  cna: 'cnabrasil.org.br',
  'confederacao da agricultura e pecuaria': 'cnabrasil.org.br',
  cnseg: 'cnseg.org.br',
  'confederacao nacional das empresas de seguros': 'cnseg.org.br',
  contag: 'contag.org.br',
  'confederacao nacional dos trabalhadores na agricultura': 'contag.org.br',
  contraf: 'contrafbrasil.org.br',
  cnti: 'cnti.org.br',
  condsef: 'condsef.org.br',
  'confederacao dos trabalhadores no servico publico federal': 'condsef.org.br',
  cnif: 'cnif.org.br',
  'confederacao nacional das instituicoes financeiras': 'cnif.org.br',

  // --- CENTRAIS SINDICAIS, MOVIMENTOS SOCIAIS & ONGS ---
  cut: 'cut.org.br',
  'central unica dos trabalhadores': 'cut.org.br',
  'central unica dos trabalhadores-cut': 'cut.org.br',
  mst: 'mst.org.br',
  'movimento dos trabalhadores rurais sem terra': 'mst.org.br',
  'movimento dos trabalhadores rurais sem terra - mst': 'mst.org.br',
  mab: 'mab.org.br',
  'movimento dos atingidos por barragens': 'mab.org.br',
  'movimento dos atingidos por barragens - mab': 'mab.org.br',
  ugt: 'ugt.org.br',
  'forca sindical': 'fsindical.org.br',
  csb: 'csb.org.br',
  ctb: 'ctb.org.br',
  fup: 'fup.org.br',
  wwf: 'wwf.org.br',
  'wwf brasil': 'wwf.org.br',
  greenpeace: 'greenpeace.org.br',
  'transparencia brasil': 'transparencia.org.br',
  'transparencia internacional': 'transparenciainternacional.org.br',
  alana: 'alana.org.br',
  'instituto alana': 'alana.org.br',
  'sos mata atlantica': 'sosma.org.br',
  isa: 'socioambiental.org',
  'instituto socioambiental': 'socioambiental.org',
  conectas: 'conectas.org',
  'conectas direitos humanos': 'conectas.org',
  oxfam: 'oxfam.org.br',

  // --- FUNDAÇÕES, INSTITUTOS, ENSINO & SISTEMA S ---
  fiesp: 'fiesp.com.br',
  firjan: 'firjan.com.br',
  sebrae: 'sebrae.com.br',
  senai: 'portaldaindustria.com.br/senai',
  sesi: 'portaldaindustria.com.br/sesi',
  sesc: 'sesc.com.br',
  senac: 'senac.br',
  senat: 'cnt.org.br',
  fgv: 'fgv.br',
  'fundacao getulio vargas': 'fgv.br',
  'fundacao getulio vargas (fgv)': 'fgv.br',
  fdc: 'fdc.org.br',
  'fundacao dom cabral': 'fdc.org.br',
  insper: 'insper.edu.br',
  fiocruz: 'fiocruz.br',
  embrapa: 'embrapa.br',

  // --- ESCRITÓRIOS DE ADVOCACIA & CONSULTORIAS ---
  'pinheiro neto': 'pinheironeto.com.br',
  'pinheiro neto advogados': 'pinheironeto.com.br',
  'mattos filho': 'mattosfilho.com.br',
  'barral parente': 'barralparente.com.br',
  'barral parente pinheiro advogados': 'barralparente.com.br',
  bma: 'bmalaw.com.br',
  'machado meyer': 'machadomeyer.com.br',
  tozzinifreire: 'tozzinifreire.com.br',
  lefosse: 'lefosse.com',
  demarest: 'demarest.com.br',
};

export function normalizeEntityName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(s\.?a\.?|s\/a|ltda|eireli|me|epp|brasil|servicos|comercio|participacoes|holding|grupo)/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAcronym(name: string): string | null {
  if (!name) return null;
  const parenMatch = name.match(/\(([A-Za-z0-9\-]+)\)/);
  if (parenMatch && parenMatch[1] && parenMatch[1].length >= 2 && parenMatch[1].length <= 10) {
    return parenMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  const dashMatch = name.match(/[\-–—]\s*([A-Za-z0-9]{2,10})\s*$/);
  if (dashMatch && dashMatch[1]) {
    return dashMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  const startMatch = name.match(/^([A-Za-z0-9]{2,8})\s*[\-–—]/);
  if (startMatch && startMatch[1]) {
    return startMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return null;
}

export function detectEntityCategory(rawName: string): EntityCategory {
  if (!rawName) return 'company';
  const n = rawName.toLowerCase();
  if (n.includes('confederacao') || n.includes('confederação')) return 'confederation';
  if (n.includes('associacao') || n.includes('associação') || n.includes('federacao') || n.includes('federação')) return 'association';
  if (n.includes('movimento') || n.includes('atingidos') || n.includes('sem terra') || n.includes('wwf') || n.includes('greenpeace') || n.includes('ong') || n.includes('alana') || n.includes('transparencia') || n.includes('socioambiental') || n.includes('conectas')) return 'ngo';
  if (n.includes('sindicato') || n.includes('central unica') || n.includes('forca sindical') || n.includes('trabalhadores') || n.includes('sindical')) return 'union';
  if (n.includes('fundacao') || n.includes('fundação') || n.includes('instituto') || n.includes('sebrae') || n.includes('senai') || n.includes('sesi') || n.includes('sesc') || n.includes('fgv') || n.includes('insper')) return 'foundation';
  if (n.includes('advogados') || n.includes('advocacia') || n.includes('consultoria') || n.includes('juridico') || n.includes('jurídico')) return 'legal';
  return 'company';
}

export function getCategoryLabel(category: EntityCategory): string {
  switch (category) {
    case 'confederation': return 'Confederação';
    case 'association': return 'Associação';
    case 'ngo': return 'ONG / Soc. Civil';
    case 'union': return 'Sindicato / Central';
    case 'foundation': return 'Fundação / Inst.';
    case 'legal': return 'Advocacia / PJ';
    default: return 'Empresa';
  }
}

export function getCompanyDomain(rawName: string): string | null {
  if (!rawName || typeof rawName !== 'string') return null;
  const rawLower = rawName.toLowerCase().trim();
  const acronym = extractAcronym(rawName);
  if (acronym && KNOWN_DOMAINS[acronym]) {
    return KNOWN_DOMAINS[acronym];
  }
  if (KNOWN_DOMAINS[rawLower]) {
    return KNOWN_DOMAINS[rawLower];
  }
  const clean = normalizeEntityName(rawName);
  if (clean && KNOWN_DOMAINS[clean]) {
    return KNOWN_DOMAINS[clean];
  }
  for (const [key, domain] of Object.entries(KNOWN_DOMAINS)) {
    if (key.length >= 4) {
      if (rawLower.includes(key) || clean.includes(key)) {
        return domain;
      }
    }
  }
  const cat = detectEntityCategory(rawName);
  if (acronym && acronym.length >= 3 && acronym.length <= 8) {
    if (cat === 'association' || cat === 'confederation' || cat === 'ngo' || cat === 'union' || cat === 'foundation') {
      return `${acronym}.org.br`;
    }
    return `${acronym}.com.br`;
  }
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 1 && words[0].length >= 3 && words[0].length <= 15) {
    return `${words[0]}.com.br`;
  }
  return null;
}

export function getCompanyLogoUrl(nameOrDomain: string): string | null {
  if (!nameOrDomain) return null;
  let domain: string | null = null;
  if (nameOrDomain.includes('.') && !nameOrDomain.includes(' ')) {
    domain = nameOrDomain;
  } else {
    domain = getCompanyDomain(nameOrDomain);
  }
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function getCompanyLogoFallbackUrl(nameOrDomain: string): string | null {
  if (!nameOrDomain) return null;
  const domain = nameOrDomain.includes('.') && !nameOrDomain.includes(' ') ? nameOrDomain : getCompanyDomain(nameOrDomain);
  if (!domain) return null;
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

export function getEntityPalette(name: string): { bg: string; text: string; border: string } {
  const cat = detectEntityCategory(name);
  switch (cat) {
    case 'confederation':
    case 'association':
      return {
        bg: 'linear-gradient(135deg, rgba(14, 165, 233, 0.25) 0%, rgba(2, 132, 199, 0.45) 100%)',
        text: '#38BDF8',
        border: 'rgba(56, 189, 248, 0.4)',
      };
    case 'ngo':
    case 'union':
      return {
        bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.45) 100%)',
        text: '#34D399',
        border: 'rgba(16, 185, 129, 0.4)',
      };
    case 'foundation':
      return {
        bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(126, 34, 206, 0.45) 100%)',
        text: '#C084FC',
        border: 'rgba(168, 85, 247, 0.4)',
      };
    case 'legal':
      return {
        bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(180, 83, 9, 0.45) 100%)',
        text: '#FCD34D',
        border: 'rgba(245, 158, 11, 0.4)',
      };
    default:
      return {
        bg: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(67, 56, 202, 0.45) 100%)',
        text: '#818CF8',
        border: 'rgba(99, 102, 241, 0.4)',
      };
  }
}

export function getCompanyInitials(name: string): string {
  if (!name) return 'EX';
  const acronym = extractAcronym(name);
  if (acronym) return acronym.toUpperCase().slice(0, 3);
  const clean = normalizeEntityName(name);
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return 'EX';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
