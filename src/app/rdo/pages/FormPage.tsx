import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Image as ImageIcon, Loader2, MapPin, PenLine, Search, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { FormSection, Labeled, inputClass } from "../components/FormSection";
import { DateField } from "../components/DateField";
import { LocationMaps } from "../components/LocationMaps";
import { reverseGeocode } from "../lib/geo";
import { fetchCnpj, isValidCnpj, maskCnpj, onlyDigits } from "../lib/cnpj";
import { notifyRelatorioFinalizado } from "../lib/notify";
import { finalizarComAssinatura, type AssinaturaPayload } from "../lib/assinatura";
import { FinalizarAssinaturaModal } from "../components/FinalizarAssinaturaModal";
import { createRelatorio, deleteFoto, getRelatorio, updateRelatorio, uploadFotos } from "../lib/relatorios";
import type { Foto, RdoStatus } from "../lib/types";

interface NovaFoto {
  file: File;
  preview: string;
}

const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--rdo-blue)] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55";
const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--rdo-line)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55";

const STEPS = [
  { n: 1, label: "Contrato e período" },
  { n: 2, label: "Localização e registros" },
];

function combine(dateYMD: string, timeHM: string): string | null {
  if (!dateYMD) return null;
  const [y, m, d] = dateYMD.split("-").map(Number);
  const [hh, mm] = (timeHM || "00:00").split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}
function splitISO(iso: string | null): [string, string] {
  if (!iso) return ["", ""];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return ["", ""];
  const p = (n: number) => String(n).padStart(2, "0");
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`];
}

export default function FormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState<RdoStatus | null>(null);
  const [origStatus, setOrigStatus] = useState<RdoStatus>("rascunho");
  const [step, setStep] = useState(1);
  const [contratoExibe, setContratoExibe] = useState("");

  const [cliente, setCliente] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [enderecoCliente, setEnderecoCliente] = useState("");
  const [situacao, setSituacao] = useState("");
  const [cnpjBusy, setCnpjBusy] = useState(false);
  const [cnpjErro, setCnpjErro] = useState("");
  const [engGaiatec, setEngGaiatec] = useState("");
  const [crea, setCrea] = useState("");
  const [engCliente, setEngCliente] = useState("");
  const [creaCliente, setCreaCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [inicioData, setInicioData] = useState("");
  const [inicioHora, setInicioHora] = useState("");
  const [fimData, setFimData] = useState("");
  const [fimHora, setFimHora] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [comentarios, setComentarios] = useState("");

  const [fotosExistentes, setFotosExistentes] = useState<Foto[]>([]);
  const [novasFotos, setNovasFotos] = useState<NovaFoto[]>([]);
  const [gpsBusy, setGpsBusy] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const novasRef = useRef<NovaFoto[]>([]);
  novasRef.current = novasFotos;
  const cnpjAutoRef = useRef("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await getRelatorio(id);
      if (r) {
        setCliente(r.cliente || "");
        setContratoExibe(r.contrato || "");
        setCnpj(r.cnpj || "");
        setRazaoSocial(r.razao_social || "");
        setNomeFantasia(r.nome_fantasia || "");
        setEnderecoCliente(r.endereco_cliente || "");
        cnpjAutoRef.current = onlyDigits(r.cnpj || "");
        setEngGaiatec(r.eng_gaiatec || "");
        setCrea(r.crea || "");
        setEngCliente(r.eng_cliente || "");
        setCreaCliente(r.crea_cliente || "");
        setEmailCliente(r.email_cliente || "");
        if (r.status !== "rascunho" || r.assinatura_status !== "nao_assinado") {
          toast.error("Relatórios finalizados ou assinados são imutáveis. Crie uma versão corretiva pela visualização.");
          navigate("/relatorio-de-obra", { replace: true });
          return;
        }
        const [iData, iHora] = splitISO(r.periodo_inicio);
        const [fData, fHora] = splitISO(r.periodo_fim);
        setInicioData(iData);
        setInicioHora(iHora);
        setFimData(fData);
        setFimHora(fHora);
        setEndereco(r.local_endereco || "");
        setNumero(r.local_numero || "");
        setLat(r.local_lat);
        setLng(r.local_lng);
        setComentarios(r.comentarios || "");
        setFotosExistentes(r.fotos ?? []);
        setOrigStatus(r.status);
      } else {
        toast.error("Relatório não encontrado.");
        navigate("/relatorio-de-obra", { replace: true });
      }
      setLoading(false);
    })();
  }, [id, navigate]);

  useEffect(() => () => novasRef.current.forEach((n) => URL.revokeObjectURL(n.preview)), []);

  async function capturarGps() {
    if (!navigator.geolocation) return toast.error("GPS não disponível neste dispositivo.");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLat(la);
        setLng(lo);
        try {
          const { endereco: end, numero: num } = await reverseGeocode(la, lo);
          if (end) setEndereco(end);
          if (num && !numero) setNumero(num);
          toast.success("Localização e endereço capturados.");
        } catch {
          toast.success("Localização capturada (endereço indisponível).");
        } finally {
          setGpsBusy(false);
        }
      },
      () => {
        setGpsBusy(false);
        toast.error("Não foi possível capturar a localização.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function buscarCnpj(raw?: string) {
    const digits = onlyDigits(raw ?? cnpj);
    if (digits.length !== 14) return setCnpjErro("Informe os 14 dígitos do CNPJ.");
    if (!isValidCnpj(digits)) return setCnpjErro("CNPJ inválido. Confira os números.");
    cnpjAutoRef.current = digits;
    setCnpjBusy(true);
    setCnpjErro("");
    try {
      const info = await fetchCnpj(digits);
      setCnpj(info.cnpj);
      setRazaoSocial(info.razaoSocial);
      setNomeFantasia(info.nomeFantasia);
      setEnderecoCliente(info.endereco);
      setSituacao(info.situacao);
      if (!cliente.trim()) setCliente(info.nomeFantasia || info.razaoSocial);
      if (info.ativa) toast.success("Dados do CNPJ preenchidos.");
      else toast.warning(`CNPJ encontrado — situação: ${info.situacao || "indefinida"}.`);
    } catch (e) {
      setCnpjErro(e instanceof Error ? e.message : "Falha ao consultar o CNPJ.");
    } finally {
      setCnpjBusy(false);
    }
  }

  function onCnpjChange(value: string) {
    const masked = maskCnpj(value);
    setCnpj(masked);
    setCnpjErro("");
    const digits = onlyDigits(masked);
    if (digits.length === 14 && isValidCnpj(digits) && cnpjAutoRef.current !== digits) {
      buscarCnpj(digits);
    }
  }

  function limparCnpj() {
    setCnpj("");
    setRazaoSocial("");
    setNomeFantasia("");
    setEnderecoCliente("");
    setSituacao("");
    setCnpjErro("");
    cnpjAutoRef.current = "";
  }

  function onPick(files: FileList | null) {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setNovasFotos((prev) => [...prev, ...imgs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }
  function removerNova(i: number) {
    setNovasFotos((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }
  async function removerExistente(foto: Foto) {
    try {
      await deleteFoto(foto);
      setFotosExistentes((prev) => prev.filter((f) => f.id !== foto.id));
    } catch {
      toast.error("Não foi possível remover a foto.");
    }
  }

  function continuar() {
    if (!cliente.trim()) {
      toast.error("Informe o nome do cliente para continuar.");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildInput() {
    return {
      cliente: cliente.trim(),
      cnpj: cnpj.trim() || null,
      razao_social: razaoSocial.trim() || null,
      nome_fantasia: nomeFantasia.trim() || null,
      endereco_cliente: enderecoCliente.trim() || null,
      eng_gaiatec: engGaiatec.trim() || null,
      crea: crea.trim() || null,
      eng_cliente: engCliente.trim() || null,
      crea_cliente: creaCliente.trim() || null,
      email_cliente: emailCliente.trim().toLowerCase() || null,
      periodo_inicio: combine(inicioData, inicioHora),
      periodo_fim: combine(fimData, fimHora),
      local_endereco: endereco.trim() || null,
      local_numero: numero.trim() || null,
      local_lat: lat,
      local_lng: lng,
      comentarios: comentarios.trim() || null,
    };
  }

  async function persist(status: RdoStatus): Promise<string> {
    const input = buildInput();
    let rid = id;
    if (rid) await updateRelatorio(rid, input, status, origStatus === "finalizado");
    else rid = (await createRelatorio(input, status)).id;
    if (novasFotos.length) {
      await uploadFotos(rid, novasFotos.map((n) => n.file), fotosExistentes.length);
      novasFotos.forEach((n) => URL.revokeObjectURL(n.preview));
      setNovasFotos([]);
    }
    return rid;
  }

  async function salvarRascunho() {
    setSaving("rascunho");
    try {
      await persist("rascunho");
      toast.success("Rascunho salvo.");
      navigate("/relatorio-de-obra");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(null);
    }
  }

  function abrirFinalizacao() {
    if (!cliente.trim()) {
      toast.error("Informe o nome do cliente para finalizar.");
      setStep(1);
      return;
    }
    setModalOpen(true);
  }

  async function confirmarFinalizacao(p: AssinaturaPayload) {
    setSaving("finalizado");
    try {
      const rid = await persist("rascunho");
      await finalizarComAssinatura(rid, p);
      try {
        const full = await getRelatorio(rid);
        if (full) await notifyRelatorioFinalizado(full);
      } catch (err) {
        console.error("[rdo] falha ao notificar:", err);
        toast.error("Assinado, mas o envio de e-mail falhou.");
      }
      setModalOpen(false);
      toast.success(
        p.modo === "presencial" ? "Relatório assinado e finalizado." : "Finalizado — link de assinatura enviado ao cliente.",
      );
      navigate("/relatorio-de-obra");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível finalizar. Tente novamente.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24">
          <Loader2 size={26} className="rdo-spin text-[var(--rdo-blue)]" />
        </div>
      </AppShell>
    );
  }

  // Horário mais estreito (e padding menor) → o campo de data (flex-1) fica mais largo.
  const timeInput =
    "w-[92px] shrink-0 rounded-md border border-[var(--rdo-line)] bg-white px-2 py-2 text-[13px] text-[var(--rdo-ink)] outline-none transition-colors focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]";

  return (
    <AppShell>
      <Toaster position="top-center" />

      <button
        onClick={() => navigate("/relatorio-de-obra")}
        className="text-[13px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
      >
        ← Relatórios
      </button>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
          Relatório Diário de Obra
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)]">
          {isEdit ? "Editar Relatório" : "Novo Relatório"}
        </h1>
      </div>

      {/* Stepper */}
      <div className="mt-6 flex max-w-2xl items-center gap-3">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <button onClick={() => (s.n === 1 ? setStep(1) : continuar())} className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  step === s.n
                    ? "bg-[var(--rdo-blue)] text-white"
                    : step > s.n
                      ? "bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]"
                      : "border border-[var(--rdo-line-strong)] text-[var(--rdo-ink-3)]"
                }`}
              >
                {step > s.n ? <Check size={13} strokeWidth={3} /> : s.n}
              </span>
              <span className={`text-[13px] ${step === s.n ? "font-semibold text-[var(--rdo-ink)]" : "font-medium text-[var(--rdo-ink-3)]"}`}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--rdo-line)]" />}
          </div>
        ))}
      </div>

      {/* Card do formulário */}
      <div className="mt-5 max-w-2xl overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6 p-5 sm:p-6"
            >
              <FormSection title="Dados do Contrato">
                <Labeled label="CNPJ do Cliente" hint="(preenche os dados automaticamente)">
                  <div className="flex gap-2">
                    <input
                      className={`${inputClass} flex-1`}
                      value={cnpj}
                      onChange={(e) => onCnpjChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          buscarCnpj();
                        }
                      }}
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                    />
                    <button
                      type="button"
                      onClick={() => buscarCnpj()}
                      disabled={cnpjBusy}
                      className={`${ghostBtn} shrink-0`}
                    >
                      {cnpjBusy ? <Loader2 size={15} className="rdo-spin" /> : <Search size={15} className="text-[var(--rdo-blue)]" />}
                      Buscar
                    </button>
                  </div>
                </Labeled>
                {cnpjErro && <p className="mt-1.5 text-[12px] font-medium text-[#d4453e]">{cnpjErro}</p>}

                {(razaoSocial || nomeFantasia || enderecoCliente) && (
                  <div className="mt-3 rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        {situacao && (
                          <span
                            className={`mb-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              situacao.toUpperCase() === "ATIVA" ? "bg-[#e8f5ee] text-[#1a7f43]" : "bg-[#fdecea] text-[#b4231d]"
                            }`}
                          >
                            {situacao}
                          </span>
                        )}
                        <CnpjLinha label="Razão social" value={razaoSocial} />
                        <CnpjLinha label="Nome fantasia" value={nomeFantasia} />
                        <CnpjLinha label="Endereço" value={enderecoCliente} />
                      </div>
                      <button
                        type="button"
                        onClick={limparCnpj}
                        className="shrink-0 text-[12px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
                      >
                        limpar
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <Labeled label="Nome do Cliente" required>
                    <input className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex: Construtora ABC" />
                  </Labeled>
                  <p className="mt-2 text-[11px] text-[var(--rdo-ghost)]">
                    Nº do contrato:{" "}
                    {isEdit ? (
                      <span className="font-semibold text-[var(--rdo-ink-3)]">{contratoExibe || "—"}</span>
                    ) : (
                      "gerado automaticamente ao salvar (RDO-####)"
                    )}
                  </p>
                </div>
              </FormSection>

              <div className="border-t border-[var(--rdo-line)]" />

              <FormSection title="Engenheiros Responsáveis">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Labeled label="Eng. Gaiatec Sistemas">
                    <input className={inputClass} value={engGaiatec} onChange={(e) => setEngGaiatec(e.target.value)} placeholder="Nome do engenheiro" />
                  </Labeled>
                  <Labeled label="CREA (Gaiatec)" hint="(opcional)">
                    <input className={inputClass} value={crea} onChange={(e) => setCrea(e.target.value)} placeholder="Ex: SP-0123456789" />
                  </Labeled>
                  <Labeled label="Eng. Cliente">
                    <input className={inputClass} value={engCliente} onChange={(e) => setEngCliente(e.target.value)} placeholder="Nome do engenheiro" />
                  </Labeled>
                  <Labeled label="CREA (Cliente)" hint="(opcional)">
                    <input className={inputClass} value={creaCliente} onChange={(e) => setCreaCliente(e.target.value)} placeholder="Ex: SP-0123456789" />
                  </Labeled>
                </div>
                <div className="mt-4">
                  <Labeled label="E-mail do responsável do cliente" hint="(para envio do relatório / assinatura)">
                    <input
                      type="email"
                      inputMode="email"
                      className={inputClass}
                      value={emailCliente}
                      onChange={(e) => setEmailCliente(e.target.value)}
                      placeholder="cliente@empresa.com.br"
                    />
                  </Labeled>
                </div>
              </FormSection>

              <div className="border-t border-[var(--rdo-line)]" />

              <FormSection title="Período dos Trabalhos">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Labeled label="Início">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <DateField value={inicioData} onChange={setInicioData} placeholder="Data" />
                      </div>
                      <input type="time" className={timeInput} value={inicioHora} onChange={(e) => setInicioHora(e.target.value)} />
                    </div>
                  </Labeled>
                  <Labeled label="Término">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <DateField value={fimData} onChange={setFimData} placeholder="Data" />
                      </div>
                      <input type="time" className={timeInput} value={fimHora} onChange={(e) => setFimHora(e.target.value)} />
                    </div>
                  </Labeled>
                </div>
              </FormSection>
            </motion.div>
          ) : (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6 p-5 sm:p-6"
            >
              <FormSection title="Localização da Obra">
                <button type="button" onClick={capturarGps} disabled={gpsBusy} className={`w-full ${ghostBtn}`}>
                  {gpsBusy ? <Loader2 size={15} className="rdo-spin" /> : <MapPin size={15} className="text-[var(--rdo-blue)]" />}
                  {gpsBusy ? "Capturando…" : "Capturar localização (GPS)"}
                </button>
                {lat != null && lng != null && (
                  <div className="mt-2 flex items-center justify-between rounded-md bg-[var(--rdo-blue-soft)] px-3 py-1.5 text-[12px] text-[var(--rdo-blue)]">
                    <span className="font-medium">GPS {lat.toFixed(5)}, {lng.toFixed(5)}</span>
                    <button type="button" onClick={() => { setLat(null); setLng(null); }} className="text-[var(--rdo-ink-3)] hover:text-[var(--rdo-ink)]">
                      remover
                    </button>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                  <Labeled label="Endereço">
                    <input className={inputClass} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, bairro, cidade" />
                  </Labeled>
                  <Labeled label="Número" hint="(opcional)">
                    <input className={inputClass} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 1000" />
                  </Labeled>
                </div>
                <LocationMaps endereco={endereco} numero={numero} lat={lat} lng={lng} />
              </FormSection>

              <div className="border-t border-[var(--rdo-line)]" />

              <FormSection title="Registro Fotográfico">
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => cameraRef.current?.click()} className={ghostBtn}>
                    <Camera size={15} /> Câmera
                  </button>
                  <button type="button" onClick={() => galeriaRef.current?.click()} className={ghostBtn}>
                    <ImageIcon size={15} /> Galeria
                  </button>
                </div>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
                <input ref={galeriaRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
                {(fotosExistentes.length > 0 || novasFotos.length > 0) && (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {fotosExistentes.map((f) => (
                      <Thumb key={f.id} src={f.url!} onRemove={() => removerExistente(f)} />
                    ))}
                    {novasFotos.map((n, i) => (
                      <Thumb key={n.preview} src={n.preview} badge onRemove={() => removerNova(i)} />
                    ))}
                  </div>
                )}
              </FormSection>

              <div className="border-t border-[var(--rdo-line)]" />

              <FormSection title="Comentários e Observações">
                <textarea
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  rows={4}
                  className={`${inputClass} resize-y`}
                  placeholder="Atividades realizadas, condições climáticas, ocorrências…"
                />
              </FormSection>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ações */}
      <div className="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={salvarRascunho} disabled={saving !== null} className={ghostBtn}>
          {saving === "rascunho" ? <Loader2 size={15} className="rdo-spin" /> : null}
          Salvar rascunho
        </button>
        <div className="flex-1" />
        {step === 1 ? (
          <button type="button" onClick={continuar} className={primaryBtn}>
            Continuar →
          </button>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => setStep(1)} className={ghostBtn}>
              ← Voltar
            </button>
            <button type="button" onClick={abrirFinalizacao} disabled={saving !== null} className={primaryBtn}>
              <PenLine size={15} />
              Finalizar e assinar
            </button>
          </div>
        )}
      </div>

      <FinalizarAssinaturaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={confirmarFinalizacao}
        busy={saving === "finalizado"}
        cliente={cliente}
        contrato={contratoExibe}
        defaultGaiatecNome={engGaiatec}
        defaultClienteNome={engCliente}
        defaultClienteEmail={emailCliente}
      />
    </AppShell>
  );
}

function CnpjLinha({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-[12px] leading-snug text-[var(--rdo-ink-2)]">
      <span className="font-semibold text-[var(--rdo-ink-3)]">{label}: </span>
      {value}
    </p>
  );
}

function Thumb({ src, onRemove, badge }: { src: string; onRemove: () => void; badge?: boolean }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)]">
      <img src={src} alt="" className="h-full w-full object-cover" />
      {badge && (
        <span className="absolute left-0 top-0 rounded-br-md bg-[var(--rdo-blue)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          Nova
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover foto"
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}
