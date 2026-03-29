/**
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — Legal Desk Panel (Enhanced v2)
 *  Tunde Balogun CLO & PRO · Modebola Awolowo — Document Guardian
 *
 *  New v2 features:
 *  - Compliance checklists per product × per jurisdiction
 *  - Regulatory tracker (pending / compliant / gap)
 *  - Legal repository (sovereign document store)
 *  - Original issue tracker + PR studio + templates preserved
 *
 *  PLACE AT: xdragon/app/ui/app/src/components/LegalDesk.tsx
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useMemo } from "react";

// ── Design tokens ─────────────────────────────────────────────────
const T = {
  gold:'#c9a84c', goldDim:'#6b5820', goldBorder:'#3a3020',
  black:'#080808', surface:'#0f0f0f', surface2:'#161616', surface3:'#202020',
  border:'#282420', text:'#f0ead8', textMuted:'#7a7060', textDim:'#3a3530',
  green:'#4a9a6a', red:'#c05040', teal:'#5ab0c8', blue:'#4a8aba',
  purple:'#9a7ab0', orange:'#d4805a', sage:'#8aaa60',
};
const TUNDE = '#8aaa60';
const MODEBOLA = '#9a7ab0';
const mono: React.CSSProperties = { fontFamily:'"Menlo","Monaco","Consolas","Courier New",monospace' };

// ── Types ──────────────────────────────────────────────────────────
type IssueStatus   = 'open' | 'in_review' | 'resolved' | 'escalated';
type IssueUrgency  = 'Critical' | 'High' | 'Medium' | 'Low';
type IssueRisk     = 'High' | 'Medium' | 'Low';
type ComplianceStatus = 'compliant' | 'gap' | 'pending' | 'na' | 'in_progress';
type DocType = 'contract' | 'license' | 'terms' | 'policy' | 'memo' | 'cert' | 'agreement' | 'regulatory';

interface LegalIssue {
  ref: string; title: string; jurisdiction: string;
  urgency: IssueUrgency; risk: IssueRisk; status: IssueStatus;
  notes: string; createdAt: number; updatedAt: number;
}

interface ComplianceItem {
  id: string;
  framework: string;          // e.g. "NDPC" "PCI-DSS" "GDPR"
  description: string;
  status: ComplianceStatus;
  notes: string;
  dueDate?: number;
  assignee: string;
}

interface ProductCompliance {
  productId: string;
  productName: string;
  jurisdiction: string;
  items: ComplianceItem[];
  lastReviewed: number | null;
}

interface LegalDocument {
  id: string;
  title: string;
  type: DocType;
  product: string;
  jurisdiction: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'executed' | 'archived';
  ref: string;
  createdAt: number;
  updatedAt: number;
  notes: string;
}

interface LegalDeskProps {
  onInject: (fn: (prev: string) => string) => void;
  onOutput?: (text: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────
const JURISDICTIONS = [
  'Nigeria', 'Kenya', 'Ghana', 'South Africa', 'Egypt',
  'UK / EU', 'Pan-African (AfCFTA)', 'Multi-jurisdiction',
];

const PRODUCTS_LIST = [
  'Archon Nexus', 'xDragon Studio', 'GeniePay', 'GenieChain',
  'GenieID', 'Vault', 'SabiWorkAI', 'Spark Messenger', 'Loom', 'Bloom', 'ErrandX',
];

const STATUS_COLORS: Record<IssueStatus, string> = {
  open: T.red, in_review: T.gold, resolved: T.green, escalated: '#ff6b35',
};
const RISK_COLORS: Record<IssueRisk, string> = { High: T.red, Medium: T.gold, Low: T.green };
const COMPLIANCE_COLORS: Record<ComplianceStatus, string> = {
  compliant: T.green, gap: T.red, pending: T.textMuted, na: T.textDim, in_progress: T.gold,
};
const COMPLIANCE_LABELS: Record<ComplianceStatus, string> = {
  compliant: '✓ Compliant', gap: '✗ Gap', pending: '○ Pending', na: '— N/A', in_progress: '◌ In Progress',
};
const DOC_STATUS_COLORS: Record<LegalDocument['status'], string> = {
  draft: T.textMuted, review: T.gold, approved: T.teal, executed: T.green, archived: T.textDim,
};

// ── Seed compliance data ──────────────────────────────────────────
function buildComplianceMatrix(): ProductCompliance[] {
  const matrix: ProductCompliance[] = [];
  const productFrameworks: Record<string, Record<string, ComplianceItem[]>> = {
    'GeniePay': {
      'Nigeria': [
        { id: 'gp-ng-1', framework: 'CBN PSP License', description: 'Payment Service Provider license from Central Bank of Nigeria', status: 'in_progress', notes: 'Application ref: CBN/PSP/2025/00142', dueDate: Date.now() + 86400000 * 60, assignee: 'TUNDE' },
        { id: 'gp-ng-2', framework: 'NDPC Compliance', description: 'Nigeria Data Protection Commission — financial data handling', status: 'compliant', notes: 'Certificate ref: NDPC/2025/FC/0089', assignee: 'TUNDE' },
        { id: 'gp-ng-3', framework: 'FIRS Integration', description: 'Federal Inland Revenue Service transaction reporting', status: 'gap', notes: 'API integration incomplete — Dev ticket #AYO-441', assignee: 'AYO' },
        { id: 'gp-ng-4', framework: 'CBN AML/CFT', description: 'Anti-Money Laundering and Counter-Financing of Terrorism policy', status: 'compliant', notes: 'Policy v3.2 approved by TUNDE', assignee: 'TUNDE' },
        { id: 'gp-ng-5', framework: 'PCI DSS Level 1', description: 'Payment Card Industry Data Security Standard', status: 'in_progress', notes: 'QSA engagement: SecurityFirst Ltd — 82% complete', assignee: 'MODEBOLA' },
      ],
      'UK / EU': [
        { id: 'gp-eu-1', framework: 'PSD2 / Open Banking', description: 'Payment Services Directive 2 compliance for EU operations', status: 'pending', notes: 'FCA sandbox application in review', assignee: 'TUNDE' },
        { id: 'gp-eu-2', framework: 'GDPR', description: 'General Data Protection Regulation — financial data', status: 'in_progress', notes: 'DPA drafted, awaiting DPO signature', assignee: 'MODEBOLA' },
        { id: 'gp-eu-3', framework: 'EMI License (FCA)', description: 'Electronic Money Institution license — UK', status: 'pending', notes: 'Pre-application meeting scheduled Q3 2026', assignee: 'TUNDE' },
      ],
    },
    'GenieID': {
      'Nigeria': [
        { id: 'gid-ng-1', framework: 'NIMC Integration', description: 'National Identity Management Commission NIN verification', status: 'compliant', notes: 'API v2 active — 99.7% uptime', assignee: 'AYO' },
        { id: 'gid-ng-2', framework: 'NIBSS BVN Gateway', description: 'Bank Verification Number — NIBSS integration', status: 'compliant', notes: 'Live since 2024-11-01', assignee: 'AYO' },
        { id: 'gid-ng-3', framework: 'NDPC Biometric Policy', description: 'Biometric data handling under NDPC regulation', status: 'gap', notes: 'Biometric retention policy needs update — critical', assignee: 'TUNDE' },
      ],
      'South Africa': [
        { id: 'gid-za-1', framework: 'POPIA', description: 'Protection of Personal Information Act — identity data', status: 'in_progress', notes: 'Information Officer registered with IRSA', assignee: 'TUNDE' },
        { id: 'gid-za-2', framework: 'FICA', description: 'Financial Intelligence Centre Act — identity verification', status: 'pending', notes: 'FICA partner integration planned Q2 2026', assignee: 'MODEBOLA' },
      ],
    },
    'GenieChain': {
      'Nigeria': [
        { id: 'gc-ng-1', framework: 'SEC Digital Assets Rules', description: 'Securities and Exchange Commission — digital asset framework', status: 'in_progress', notes: 'SEC registration ref: SEC/DAX/2025/0041', assignee: 'TUNDE' },
        { id: 'gc-ng-2', framework: 'CBN Virtual Assets Policy', description: 'CBN circular on virtual asset service providers (VASP)', status: 'compliant', notes: 'VASP classification confirmed — low-risk', assignee: 'TUNDE' },
      ],
      'Pan-African (AfCFTA)': [
        { id: 'gc-afcfta-1', framework: 'AfCFTA Digital Trade Protocol', description: 'African Continental Free Trade Area digital commerce standards', status: 'pending', notes: 'Working group engagement — AU Commission ref', assignee: 'MODEBOLA' },
      ],
    },
    'Archon Nexus': {
      'Multi-jurisdiction': [
        { id: 'an-multi-1', framework: 'ISO/IEC 27001', description: 'Information Security Management System', status: 'in_progress', notes: 'BSI audit phase 2 — 68% complete', assignee: 'MODEBOLA' },
        { id: 'an-multi-2', framework: 'SOC 2 Type II', description: 'Service Organization Control 2 — security & availability', status: 'in_progress', notes: 'AICPA assessor engaged — 34% complete', assignee: 'TUNDE' },
      ],
    },
    'SabiWorkAI': {
      'Nigeria': [
        { id: 'sw-ng-1', framework: 'NDPC AI Data Policy', description: 'AI-specific data processing policy under NDPC framework', status: 'gap', notes: 'No formal AI data policy drafted yet — HIGH priority', assignee: 'TUNDE' },
        { id: 'sw-ng-2', framework: 'NCC Employer Data Rules', description: 'Nigerian Communications Commission — workplace data', status: 'pending', notes: 'Pending NCC consultation Q3 2026', assignee: 'TUNDE' },
      ],
    },
  };

  for (const [product, jData] of Object.entries(productFrameworks)) {
    for (const [jurisdiction, items] of Object.entries(jData)) {
      matrix.push({
        productId: product.toLowerCase().replace(/\s+/g, '-'),
        productName: product,
        jurisdiction,
        items,
        lastReviewed: Date.now() - Math.random() * 86400000 * 30,
      });
    }
  }
  return matrix;
}

function seedDocs(): LegalDocument[] {
  return [
    { id: 'd1', title: 'GeniePay Terms of Service v3.1', type: 'terms', product: 'GeniePay', jurisdiction: 'Nigeria', version: '3.1', status: 'executed', ref: 'LEGAL-2025-042', createdAt: Date.now() - 86400000 * 90, updatedAt: Date.now() - 86400000 * 10, notes: 'Signed by ARCHON' },
    { id: 'd2', title: 'GenieID Privacy Policy v2.0', type: 'policy', product: 'GenieID', jurisdiction: 'Multi-jurisdiction', version: '2.0', status: 'approved', ref: 'LEGAL-2025-051', createdAt: Date.now() - 86400000 * 60, updatedAt: Date.now() - 86400000 * 5, notes: 'TUNDE approved · pending execution' },
    { id: 'd3', title: 'Vault Data Processing Agreement', type: 'agreement', product: 'Vault', jurisdiction: 'UK / EU', version: '1.0', status: 'review', ref: 'LEGAL-2026-001', createdAt: Date.now() - 86400000 * 14, updatedAt: Date.now() - 86400000 * 2, notes: 'Under TUNDE review — GDPR DPA template' },
    { id: 'd4', title: 'CBN Sandbox License Agreement', type: 'license', product: 'GeniePay', jurisdiction: 'Nigeria', version: '2.0', status: 'executed', ref: 'LEGAL-2025-018', createdAt: Date.now() - 86400000 * 180, updatedAt: Date.now() - 86400000 * 30, notes: 'Expires in 90 days — renewal initiated' },
    { id: 'd5', title: 'GenieChain VASP Declaration', type: 'regulatory', product: 'GenieChain', jurisdiction: 'Nigeria', version: '1.0', status: 'executed', ref: 'LEGAL-2025-033', createdAt: Date.now() - 86400000 * 120, updatedAt: Date.now() - 86400000 * 120, notes: 'CBN-accepted VASP self-declaration' },
    { id: 'd6', title: 'Archon Nexus DPA (NDPC)', type: 'regulatory', product: 'Archon Nexus', jurisdiction: 'Nigeria', version: '1.2', status: 'approved', ref: 'LEGAL-2025-067', createdAt: Date.now() - 86400000 * 50, updatedAt: Date.now() - 86400000 * 3, notes: 'Data Protection Agreement — NDPC registered' },
    { id: 'd7', title: 'xDragon Studio IP Assignment Agreement', type: 'agreement', product: 'xDragon Studio', jurisdiction: 'Multi-jurisdiction', version: '1.0', status: 'executed', ref: 'LEGAL-2026-003', createdAt: Date.now() - 86400000 * 7, updatedAt: Date.now() - 86400000 * 1, notes: 'All IP vested in Genie Network DS Ltd' },
    { id: 'd8', title: 'SabiWorkAI Employer Terms', type: 'terms', product: 'SabiWorkAI', jurisdiction: 'Nigeria', version: '0.9', status: 'draft', ref: 'LEGAL-2026-008', createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now(), notes: 'TUNDE drafting — needs NDPC AI clause' },
  ];
}

function loadIssues(): LegalIssue[] {
  try { const s = localStorage.getItem('archon_legal_issues'); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveIssues(issues: LegalIssue[]) {
  try { localStorage.setItem('archon_legal_issues', JSON.stringify(issues)); } catch {}
}
function nextRef(issues: LegalIssue[]): string {
  const year = new Date().getFullYear();
  const n = String(issues.filter(i => i.ref.includes(`-${year}-`)).length + 1).padStart(3, '0');
  return `LEGAL-${year}-${n}`;
}

function loadDocs(): LegalDocument[] {
  try { const s = localStorage.getItem('archon_legal_docs'); return s ? JSON.parse(s) : seedDocs(); } catch { return seedDocs(); }
}
function saveDocs(docs: LegalDocument[]) {
  try { localStorage.setItem('archon_legal_docs', JSON.stringify(docs)); } catch {}
}

const PR_TEMPLATES = [
  { label: 'Product Launch', icon: '◈', prompt: `PRESS RELEASE — PRODUCT LAUNCH\n\nDraft a press release for the following Genie Network product launch. Follow AP style. Include: headline, dateline (Lagos), lead paragraph, product summary, quotes from leadership, technical highlights, regulatory compliance note, and boilerplate.\n\nProduct Name:\nLaunch Date:\nKey Features:\nTarget Market:\nRegulatory Status:\nQuote attributions:\nEmbargo instructions:` },
  { label: 'Crisis Response', icon: '⚠', prompt: `CRISIS COMMUNICATIONS — RESPONSE STATEMENT\n\nDraft a crisis communications response for the following incident. Include: initial statement, key messages (3 max), what we know / do not know, immediate actions taken, next update ETA, holding statement for media.\n\nIncident:\nAffected parties:\nJurisdictions involved:\nRegulatory exposure:\nInternal response initiated:\nSpokesperson:` },
  { label: 'Regulatory Announcement', icon: '⚖', prompt: `REGULATORY ANNOUNCEMENT — STAKEHOLDER COMMUNICATION\n\nDraft a stakeholder communication regarding a regulatory development. Include: summary, impact on Genie Network, timeline for compliance, actions being taken, and reassurance messaging.\n\nRegulatory development:\nIssuing authority:\nJurisdiction(s):\nEffective date:\nOur current compliance posture:\nKey stakeholders:` },
];

const LEGAL_TEMPLATES = [
  { label: 'Compliance Review', prompt: `REGULATORY COMPLIANCE REVIEW\n\nConduct a structured compliance review for the following product/feature across African jurisdictions.\n\nPRODUCT / FEATURE: [name]\nJURISDICTIONS: Nigeria · Kenya · Ghana · South Africa\n\nFor each jurisdiction:\n1. Applicable regulatory frameworks (cite Act + Section + year)\n2. Licensing requirements\n3. Data protection obligations\n4. Risk level: High / Medium / Low\n5. Action items with owners and deadlines\n\nProduct/Feature:\nKey activities:\nData collected:\nRevenue model:\nTarget launch date:` },
  { label: 'Contract Review', prompt: `CONTRACT REVIEW — TUNDE BALOGUN, CLO\n\nReview the following contract. Produce:\n1. Executive summary (3 sentences)\n2. Risk register — table: Clause | Risk | Severity | Recommended position\n3. Missing clauses checklist\n4. Regulatory conflicts with applicable African law\n5. Recommended amendments (priority-ordered)\n6. Overall risk score (1–10)\n\n[PASTE CONTRACT BELOW]` },
  { label: 'T&C Draft', prompt: `TERMS & CONDITIONS DRAFT — GNDS STANDARD\n\nDraft Terms and Conditions for the following Genie Network product. Include:\n1. GNDS header\n2. Definitions\n3. User rights and restrictions\n4. Data handling (NDPC/GDPR)\n5. Payment terms (if applicable)\n6. IP clause\n7. Liability limitation\n8. Dispute resolution + arbitration\n9. Governing law\n\nProduct:\nUser types:\nJurisdictions:\nPayment involved:` },
  { label: 'Legal Memo', prompt: `LEGAL MEMORANDUM — ARCHON NEXUS LEGAL DESK\nGNDS: CONFIDENTIAL\nREF: LEGAL-${new Date().getFullYear()}-[NNN]\n\nTO: The Archon\nFROM: Tunde Balogun, CLO & PRO\nDATE: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}\nRE: [SUBJECT]\n\nI. EXECUTIVE SUMMARY\nII. APPLICABLE FRAMEWORKS\nIII. ANALYSIS\nIV. RISK ASSESSMENT\nV. RECOMMENDED POSITION\nVI. ACTION ITEMS\n\nLegal question:\nContext:\nUrgency:\nJurisdictions:` },
];

// ══════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function LegalDesk({ onInject }: LegalDeskProps) {
  const [tab, setTab] = useState<'issues' | 'compliance' | 'repo' | 'pr' | 'templates'>('issues');
  const [issues, setIssues] = useState<LegalIssue[]>(loadIssues);
  const [docs, setDocs] = useState<LegalDocument[]>(loadDocs);
  const complianceMatrix = useMemo(() => buildComplianceMatrix(), []);

  // Issues form
  const [newOpen, setNewOpen]   = useState(false);
  const [nTitle, setNTitle]     = useState('');
  const [nJuris, setNJuris]     = useState(JURISDICTIONS[0]);
  const [nUrgency, setNUrgency] = useState<IssueUrgency>('Medium');
  const [nRisk, setNRisk]       = useState<IssueRisk>('Medium');
  const [nNotes, setNNotes]     = useState('');
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  // Compliance filters
  const [compProduct, setCompProduct] = useState<string>('All');
  const [compJuris, setCompJuris]     = useState<string>('All');
  const [compStatus, setCompStatus]   = useState<ComplianceStatus | 'All'>('All');

  // Repo filters
  const [repoProduct, setRepoProduct]     = useState<string>('All');
  const [repoJuris, setRepoJuris]         = useState<string>('All');
  const [repoType, setRepoType]           = useState<DocType | 'All'>('All');
  const [expandedDoc, setExpandedDoc]     = useState<string | null>(null);
  const [newDocOpen, setNewDocOpen]       = useState(false);
  const [newDocTitle, setNewDocTitle]     = useState('');
  const [newDocProduct, setNewDocProduct] = useState(PRODUCTS_LIST[0]);
  const [newDocType, setNewDocType]       = useState<DocType>('terms');
  const [newDocJuris, setNewDocJuris]     = useState(JURISDICTIONS[0]);
  const [newDocNotes, setNewDocNotes]     = useState('');

  // ── Issue actions ─────────────────────────────────────────────
  const createIssue = useCallback(() => {
    if (!nTitle.trim()) return;
    const updated = [...issues, {
      ref: nextRef(issues), title: nTitle.trim(), jurisdiction: nJuris,
      urgency: nUrgency, risk: nRisk, status: 'open' as IssueStatus,
      notes: nNotes.trim(), createdAt: Date.now(), updatedAt: Date.now(),
    }];
    setIssues(updated); saveIssues(updated);
    setNTitle(''); setNNotes(''); setNewOpen(false);
  }, [issues, nTitle, nJuris, nUrgency, nRisk, nNotes]);

  const updateStatus = useCallback((ref: string, status: IssueStatus) => {
    const updated = issues.map(i => i.ref === ref ? { ...i, status, updatedAt: Date.now() } : i);
    setIssues(updated); saveIssues(updated);
  }, [issues]);

  const deleteIssue = useCallback((ref: string) => {
    const updated = issues.filter(i => i.ref !== ref);
    setIssues(updated); saveIssues(updated);
  }, [issues]);

  // ── Compliance helpers ────────────────────────────────────────
  const filteredCompliance = useMemo(() => {
    return complianceMatrix.filter(pc => {
      if (compProduct !== 'All' && pc.productName !== compProduct) return false;
      if (compJuris !== 'All' && pc.jurisdiction !== compJuris) return false;
      if (compStatus !== 'All' && !pc.items.some(i => i.status === compStatus)) return false;
      return true;
    });
  }, [complianceMatrix, compProduct, compJuris, compStatus]);

  const complianceSummary = useMemo(() => {
    const all = complianceMatrix.flatMap(pc => pc.items);
    return {
      total: all.length,
      compliant: all.filter(i => i.status === 'compliant').length,
      gap: all.filter(i => i.status === 'gap').length,
      in_progress: all.filter(i => i.status === 'in_progress').length,
      pending: all.filter(i => i.status === 'pending').length,
    };
  }, [complianceMatrix]);

  // ── Repo actions ──────────────────────────────────────────────
  const filteredDocs = useMemo(() => {
    return docs.filter(d => {
      if (repoProduct !== 'All' && d.product !== repoProduct) return false;
      if (repoJuris !== 'All' && d.jurisdiction !== repoJuris) return false;
      if (repoType !== 'All' && d.type !== repoType) return false;
      return true;
    });
  }, [docs, repoProduct, repoJuris, repoType]);

  const createDoc = useCallback(() => {
    if (!newDocTitle.trim()) return;
    const year = new Date().getFullYear();
    const ref = `LEGAL-${year}-${String(docs.length + 1).padStart(3, '0')}`;
    const newDoc: LegalDocument = {
      id: Math.random().toString(36).slice(2), title: newDocTitle.trim(),
      type: newDocType, product: newDocProduct, jurisdiction: newDocJuris,
      version: '1.0', status: 'draft', ref, createdAt: Date.now(), updatedAt: Date.now(),
      notes: newDocNotes.trim(),
    };
    const updated = [newDoc, ...docs];
    setDocs(updated); saveDocs(updated);
    setNewDocTitle(''); setNewDocNotes(''); setNewDocOpen(false);
  }, [docs, newDocTitle, newDocType, newDocProduct, newDocJuris, newDocNotes]);

  const updateDocStatus = useCallback((id: string, status: LegalDocument['status']) => {
    const updated = docs.map(d => d.id === id ? { ...d, status, updatedAt: Date.now() } : d);
    setDocs(updated); saveDocs(updated);
  }, [docs]);

  // ── Shared styles ─────────────────────────────────────────────
  const tabBtn = (id: string): React.CSSProperties => ({
    ...mono, fontSize:'0.58rem', letterSpacing:'0.1em', textTransform:'uppercase',
    padding:'5px 10px', borderRadius:0, background:'transparent',
    border:'none', borderBottom:`2px solid ${tab === id ? TUNDE : 'transparent'}`,
    color: tab === id ? TUNDE : T.textMuted, cursor:'pointer', flexShrink: 0,
  });
  const inputSt: React.CSSProperties = {
    ...mono, background:T.surface, border:`1px solid ${T.border}`,
    borderRadius:3, color:T.text, fontSize:'0.65rem', padding:'4px 8px', outline:'none',
  };
  const selectSt: React.CSSProperties = { ...inputSt, cursor:'pointer' };
  const btnSm = (color: string, outline=false): React.CSSProperties => ({
    ...mono, fontSize:'0.56rem', padding:'3px 9px', borderRadius:3, cursor:'pointer',
    background: outline ? 'transparent' : color, color: outline ? color : T.black,
    border: `1px solid ${color}${outline ? '80' : ''}`, fontWeight: outline ? 400 : 700,
  });

  return (
    <div style={{ flexShrink:0, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:T.surface3, borderBottom:`1px solid ${T.border}` }}>
        <span style={{ color:TUNDE, fontSize:'0.65rem' }}>⚖</span>
        <span style={{ ...mono, fontSize:'0.56rem', letterSpacing:'0.18em', color:TUNDE, textTransform:'uppercase' }}>Legal Desk</span>
        <span style={{ ...mono, fontSize:'0.54rem', color:T.textDim }}>TUNDE Balogun CLO · MODEBOLA Awolowo</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:2, overflowX: 'auto' }}>
          {(['issues','compliance','repo','pr','templates'] as const).map(t => (
            <button key={t} style={tabBtn(t)} onClick={() => setTab(t)}>
              {t === 'issues' ? '◎ Issues' : t === 'compliance' ? '◆ Compliance' : t === 'repo' ? '◈ Repository' : t === 'pr' ? '▶ PR Studio' : '⚖ Templates'}
            </button>
          ))}
        </div>
      </div>

      {/* ══ ISSUES ══════════════════════════════════════════════ */}
      {tab === 'issues' && (
        <div style={{ maxHeight:280, overflowY:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 10px', borderBottom:`1px solid ${T.border}` }}>
            <span style={{ ...mono, fontSize:'0.58rem', color:T.textMuted }}>{issues.length} issue{issues.length !== 1 ? 's' : ''} tracked</span>
            <button style={btnSm(TUNDE)} onClick={() => setNewOpen(v => !v)}>{newOpen ? '✕ Cancel' : '+ New Issue'}</button>
          </div>
          {newOpen && (
            <div style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border}`, background:T.surface3, display:'flex', flexDirection:'column', gap:6 }}>
              <input value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="Issue title…" style={{ ...inputSt, width:'100%' }} onKeyDown={e => e.key === 'Enter' && createIssue()} />
              <div style={{ display:'flex', gap:6 }}>
                <select value={nJuris} onChange={e => setNJuris(e.target.value)} style={{ ...selectSt, flex:1 }}>
                  {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
                </select>
                <select value={nUrgency} onChange={e => setNUrgency(e.target.value as IssueUrgency)} style={selectSt}>
                  {(['Critical','High','Medium','Low'] as IssueUrgency[]).map(u => <option key={u}>{u}</option>)}
                </select>
                <select value={nRisk} onChange={e => setNRisk(e.target.value as IssueRisk)} style={selectSt}>
                  {(['High','Medium','Low'] as IssueRisk[]).map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <textarea value={nNotes} onChange={e => setNNotes(e.target.value)} placeholder="Context / notes…" rows={2} style={{ ...inputSt, width:'100%', resize:'none', lineHeight:1.5 }} />
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button style={btnSm(TUNDE)} onClick={createIssue}>Create Issue</button>
              </div>
            </div>
          )}
          {issues.length === 0 && !newOpen && (
            <div style={{ padding:'16px 10px', textAlign:'center', ...mono, fontSize:'0.62rem', color:T.textDim }}>
              No issues tracked. Click <strong style={{color:TUNDE}}>+ New Issue</strong> to open one.
            </div>
          )}
          {issues.map(issue => (
            <div key={issue.ref} style={{ borderBottom:`1px solid ${T.border}` }}>
              <div onClick={() => setExpandedIssue(v => v === issue.ref ? null : issue.ref)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', cursor:'pointer' }}>
                <span style={{ ...mono, fontSize:'0.58rem', color:TUNDE, fontWeight:700, flexShrink:0 }}>{issue.ref}</span>
                <span style={{ ...mono, fontSize:'0.64rem', color:T.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{issue.title}</span>
                <span style={{ ...mono, fontSize:'0.54rem', color:RISK_COLORS[issue.risk], border:`1px solid ${RISK_COLORS[issue.risk]}50`, borderRadius:2, padding:'1px 5px', flexShrink:0 }}>{issue.risk}</span>
                <span style={{ ...mono, fontSize:'0.54rem', color:STATUS_COLORS[issue.status], border:`1px solid ${STATUS_COLORS[issue.status]}50`, borderRadius:2, padding:'1px 5px', flexShrink:0 }}>{issue.status.replace('_',' ')}</span>
                <span style={{ ...mono, fontSize:'0.56rem', color:T.textDim, flexShrink:0 }}>{issue.jurisdiction}</span>
              </div>
              {expandedIssue === issue.ref && (
                <div style={{ padding:'6px 10px 10px', background:T.surface3, borderTop:`1px solid ${T.border}` }}>
                  {issue.notes && <div style={{ ...mono, fontSize:'0.61rem', color:T.textMuted, lineHeight:1.6, marginBottom:8 }}>{issue.notes}</div>}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button style={btnSm(TUNDE)} onClick={() => onInject(() => `Open legal issue for review:\n\nRef: ${issue.ref}\nTitle: ${issue.title}\nJurisdiction: ${issue.jurisdiction}\nUrgency: ${issue.urgency} | Risk: ${issue.risk}\nStatus: ${issue.status}\n${issue.notes ? `\nContext:\n${issue.notes}` : ''}\n\nPlease conduct a full legal analysis and recommend next steps.`)}>
                      ▶ Assign to Agent
                    </button>
                    {(['open','in_review','resolved','escalated'] as IssueStatus[]).map(s => (
                      issue.status !== s && (
                        <button key={s} style={btnSm(STATUS_COLORS[s], true)} onClick={() => updateStatus(issue.ref, s)}>→ {s.replace('_',' ')}</button>
                      )
                    ))}
                    <button style={{ ...btnSm(T.red, true), marginLeft:'auto' }} onClick={() => deleteIssue(issue.ref)}>✕ Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ COMPLIANCE ══════════════════════════════════════════ */}
      {tab === 'compliance' && (
        <div style={{ maxHeight:300, overflowY:'auto' }}>
          {/* Summary tiles */}
          <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${T.border}` }}>
            {([
              { label:'Compliant', val:complianceSummary.compliant, color:T.green },
              { label:'Gap', val:complianceSummary.gap, color:T.red },
              { label:'In Progress', val:complianceSummary.in_progress, color:T.gold },
              { label:'Pending', val:complianceSummary.pending, color:T.textMuted },
              { label:'Total', val:complianceSummary.total, color:T.text },
            ]).map(tile => (
              <div key={tile.label} style={{ flex:1, padding:'6px 8px', textAlign:'center', borderRight:`1px solid ${T.border}` }}>
                <div style={{ ...mono, fontSize:'0.88rem', fontWeight:700, color:tile.color as string }}>{tile.val}</div>
                <div style={{ ...mono, fontSize:'0.5rem', color:T.textDim }}>{tile.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:6, padding:'6px 10px', borderBottom:`1px solid ${T.border}`, flexWrap:'wrap' }}>
            <select value={compProduct} onChange={e => setCompProduct(e.target.value)} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Products</option>
              {[...new Set(complianceMatrix.map(p => p.productName))].map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={compJuris} onChange={e => setCompJuris(e.target.value)} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Jurisdictions</option>
              {[...new Set(complianceMatrix.map(p => p.jurisdiction))].map(j => <option key={j}>{j}</option>)}
            </select>
            <select value={compStatus} onChange={e => setCompStatus(e.target.value as ComplianceStatus | 'All')} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Statuses</option>
              {(['compliant','gap','in_progress','pending','na'] as ComplianceStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {filteredCompliance.map(pc => (
            <div key={`${pc.productId}-${pc.jurisdiction}`}>
              {/* Product × Jurisdiction header */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:T.surface3, borderBottom:`1px solid ${T.border}` }}>
                <span style={{ ...mono, fontSize:'0.62rem', color:TUNDE, fontWeight:700 }}>{pc.productName}</span>
                <span style={{ ...mono, fontSize:'0.56rem', color:T.textDim }}>·</span>
                <span style={{ ...mono, fontSize:'0.58rem', color:T.textMuted }}>{pc.jurisdiction}</span>
                <span style={{ ...mono, fontSize:'0.52rem', color:T.textDim, marginLeft:'auto' }}>
                  {pc.lastReviewed ? `Reviewed: ${new Date(pc.lastReviewed).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}` : 'Not reviewed'}
                </span>
                <button style={{ ...btnSm(TUNDE, true), fontSize:'0.5rem' }} onClick={() =>
                  onInject(() => `Compliance review request:\n\nProduct: ${pc.productName}\nJurisdiction: ${pc.jurisdiction}\n\nFrameworks:\n${pc.items.map(i => `- ${i.framework}: ${i.status} — ${i.description}`).join('\n')}\n\nGaps:\n${pc.items.filter(i => i.status === 'gap').map(i => `- ${i.framework}: ${i.notes}`).join('\n') || 'None identified'}\n\nPlease review and provide remediation recommendations.`)
                }>Review</button>
              </div>

              {/* Checklist items */}
              {pc.items.map(item => (
                <div key={item.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'5px 10px', borderBottom:`1px solid ${T.border}22` }}>
                  <span style={{ ...mono, fontSize:'0.6rem', color:COMPLIANCE_COLORS[item.status], width:16, flexShrink:0 }}>
                    {item.status === 'compliant' ? '✓' : item.status === 'gap' ? '✗' : item.status === 'in_progress' ? '◌' : '○'}
                  </span>
                  <span style={{ ...mono, fontSize:'0.58rem', color:TUNDE, width:120, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.framework}</span>
                  <span style={{ ...mono, fontSize:'0.6rem', color:T.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description}</span>
                  <span style={{ ...mono, fontSize:'0.52rem', border:`1px solid ${COMPLIANCE_COLORS[item.status]}44`, borderRadius:2, padding:'1px 5px', color:COMPLIANCE_COLORS[item.status], flexShrink:0 }}>
                    {COMPLIANCE_LABELS[item.status]}
                  </span>
                  <span style={{ ...mono, fontSize:'0.52rem', color:T.textDim, flexShrink:0 }}>{item.assignee}</span>
                </div>
              ))}
            </div>
          ))}

          {filteredCompliance.length === 0 && (
            <div style={{ padding:'20px', textAlign:'center', ...mono, fontSize:'0.62rem', color:T.textDim }}>
              No compliance records match the current filter.
            </div>
          )}
        </div>
      )}

      {/* ══ LEGAL REPOSITORY ════════════════════════════════════ */}
      {tab === 'repo' && (
        <div style={{ maxHeight:300, overflowY:'auto' }}>
          {/* Controls */}
          <div style={{ display:'flex', gap:6, padding:'6px 10px', borderBottom:`1px solid ${T.border}`, alignItems:'center', flexWrap:'wrap' }}>
            <select value={repoProduct} onChange={e => setRepoProduct(e.target.value)} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Products</option>
              {PRODUCTS_LIST.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={repoJuris} onChange={e => setRepoJuris(e.target.value)} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Jurisdictions</option>
              {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
            </select>
            <select value={repoType} onChange={e => setRepoType(e.target.value as DocType | 'All')} style={{ ...selectSt, fontSize:'0.58rem' }}>
              <option value="All">All Types</option>
              {(['contract','license','terms','policy','memo','cert','agreement','regulatory'] as DocType[]).map(t => <option key={t}>{t}</option>)}
            </select>
            <button style={{ ...btnSm(TUNDE), marginLeft:'auto', fontSize:'0.56rem' }} onClick={() => setNewDocOpen(v => !v)}>
              {newDocOpen ? '✕' : '+ Add Document'}
            </button>
          </div>

          {newDocOpen && (
            <div style={{ padding:'8px 10px', borderBottom:`1px solid ${T.border}`, background:T.surface3, display:'flex', flexDirection:'column', gap:6 }}>
              <input value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} placeholder="Document title…" style={{ ...inputSt, width:'100%' }} />
              <div style={{ display:'flex', gap:6 }}>
                <select value={newDocProduct} onChange={e => setNewDocProduct(e.target.value)} style={{ ...selectSt, flex:1 }}>
                  {PRODUCTS_LIST.map(p => <option key={p}>{p}</option>)}
                </select>
                <select value={newDocType} onChange={e => setNewDocType(e.target.value as DocType)} style={selectSt}>
                  {(['contract','license','terms','policy','memo','cert','agreement','regulatory'] as DocType[]).map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={newDocJuris} onChange={e => setNewDocJuris(e.target.value)} style={{ ...selectSt, flex:1 }}>
                  {JURISDICTIONS.map(j => <option key={j}>{j}</option>)}
                </select>
              </div>
              <textarea value={newDocNotes} onChange={e => setNewDocNotes(e.target.value)} placeholder="Notes / summary…" rows={2} style={{ ...inputSt, width:'100%', resize:'none' }} />
              <div style={{ display:'flex', justifyContent:'flex-end', gap:6 }}>
                <button style={btnSm(TUNDE)} onClick={createDoc}>Add to Repository</button>
              </div>
            </div>
          )}

          {filteredDocs.map(doc => (
            <div key={doc.id} style={{ borderBottom:`1px solid ${T.border}` }}>
              <div onClick={() => setExpandedDoc(v => v === doc.id ? null : doc.id)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', cursor:'pointer' }}>
                <span style={{ ...mono, fontSize:'0.58rem', color:TUNDE, fontWeight:700, flexShrink:0, width:110 }}>{doc.ref}</span>
                <span style={{ ...mono, fontSize:'0.63rem', color:T.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</span>
                <span style={{ ...mono, fontSize:'0.52rem', color:T.textDim, flexShrink:0 }}>{doc.product}</span>
                <span style={{ ...mono, fontSize:'0.52rem', border:`1px solid ${DOC_STATUS_COLORS[doc.status]}44`, borderRadius:2, padding:'1px 5px', color:DOC_STATUS_COLORS[doc.status], flexShrink:0 }}>{doc.status}</span>
                <span style={{ ...mono, fontSize:'0.5rem', color:T.textDim, flexShrink:0, border:`1px solid ${T.border}`, borderRadius:2, padding:'1px 4px' }}>{doc.type}</span>
              </div>
              {expandedDoc === doc.id && (
                <div style={{ padding:'6px 10px 10px', background:T.surface3, borderTop:`1px solid ${T.border}` }}>
                  <div style={{ display:'flex', gap:16, marginBottom:6 }}>
                    <span style={{ ...mono, fontSize:'0.56rem', color:T.textMuted }}>Jurisdiction: {doc.jurisdiction}</span>
                    <span style={{ ...mono, fontSize:'0.56rem', color:T.textMuted }}>Version: {doc.version}</span>
                    <span style={{ ...mono, fontSize:'0.56rem', color:T.textMuted }}>Updated: {new Date(doc.updatedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
                  </div>
                  {doc.notes && <div style={{ ...mono, fontSize:'0.6rem', color:T.textMuted, lineHeight:1.6, marginBottom:8 }}>{doc.notes}</div>}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {(['draft','review','approved','executed','archived'] as LegalDocument['status'][]).map(s => (
                      doc.status !== s && (
                        <button key={s} style={{ ...btnSm(DOC_STATUS_COLORS[s], true), fontSize:'0.52rem' }} onClick={() => updateDocStatus(doc.id, s)}>
                          → {s}
                        </button>
                      )
                    ))}
                    <button style={btnSm(TUNDE, true)} onClick={() =>
                      onInject(() => `Document review request:\n\nRef: ${doc.ref}\nTitle: ${doc.title}\nType: ${doc.type}\nProduct: ${doc.product}\nJurisdiction: ${doc.jurisdiction}\nStatus: ${doc.status}\n${doc.notes ? `\nNotes: ${doc.notes}` : ''}\n\nPlease review this document and provide analysis.`)
                    }>
                      ▶ Agent Review
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredDocs.length === 0 && (
            <div style={{ padding:'20px', textAlign:'center', ...mono, fontSize:'0.62rem', color:T.textDim }}>
              No documents in repository for current filter.
            </div>
          )}
        </div>
      )}

      {/* ══ PR STUDIO ════════════════════════════════════════════ */}
      {tab === 'pr' && (
        <div style={{ padding:'8px 10px' }}>
          <div style={{ ...mono, fontSize:'0.58rem', color:T.textMuted, marginBottom:8 }}>
            Select a PR template — injected into prompt for TUNDE to draft.
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {PR_TEMPLATES.map(t => (
              <button key={t.label} onClick={() => onInject(() => t.prompt)}
                style={{ ...mono, fontSize:'0.62rem', padding:'5px 12px', borderRadius:4, background:T.surface3, border:`1px solid ${T.border}`, color:T.textMuted, cursor:'pointer', display:'flex', gap:5, alignItems:'center' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = TUNDE; (e.currentTarget as HTMLElement).style.color = TUNDE; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.color = T.textMuted; }}
              >
                <span style={{ color:TUNDE }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ LEGAL TEMPLATES ══════════════════════════════════════ */}
      {tab === 'templates' && (
        <div style={{ padding:'8px 10px' }}>
          <div style={{ ...mono, fontSize:'0.58rem', color:T.textMuted, marginBottom:8 }}>
            Legal document templates — injected into prompt for TUNDE to complete.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {LEGAL_TEMPLATES.map(t => (
              <div key={t.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', borderRadius:4, background:T.surface3, border:`1px solid ${T.border}` }}>
                <div style={{ ...mono, fontSize:'0.65rem', color:T.text, fontWeight:600 }}>{t.label}</div>
                <button onClick={() => onInject(() => t.prompt)} style={btnSm(TUNDE)}>▶ Load</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, padding:'7px 10px', background:T.surface3, border:`1px solid ${T.border}`, borderRadius:3 }}>
            <div style={{ ...mono, fontSize:'0.54rem', color:T.textDim, lineHeight:1.6 }}>
              <span style={{ color:MODEBOLA }}>◈ MODEBOLA — GNDS Standard:</span> All legal outputs carry GNDS header · LEGAL-YYYY-NNN · Classification · Version before entering Sovereign Vault.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
