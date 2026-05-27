import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Toaster, toast } from "sonner";
import { AppShell } from "../AppShell";
import { FormSection, Labeled, inputClass } from "../components/FormSection";
import { DateTimeField } from "../components/DateTimeField";
import {
  createRelatorio,
  deleteFoto,
  getRelatorio,
  updateRelatorio,
  uploadFotos,
} from "../lib/relatorios";
import type { Foto, RdoStatus } from "../lib/types";

interface NovaFoto {
  file: File;
  preview: string;
}

const ghostBtn =
  "border border-[var(--rdo-line)] bg-white px-6 py-2.5 text-[13px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55";
const primaryBtn =
  "bg-[var(--rdo-orange)] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)] disabled:opacity-55";

const STEPS = [
  { n: 1, label: "Contrato e período" },
  { n: 2, label: "Localização e registros" },
];

export default function FormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState<RdoStatus | null>(null);
  const [origStatus, setOrigStatus] = useState<RdoStatus>("rascunho");
  const [step, setStep] = useState(1);

  const [cliente, setCliente] = useState("");
  const [contrato, setContrato] = useState("");
  const [engGaiatec, setEngGaiatec] = useState("");
  const [engCliente, setEngCliente] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [endereco, setEndereco] = useState("");
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

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await getRelatorio(id);
      if (r) {
        setCliente(r.cliente || "");
        setContrato(r.contrato || "");
        setEngGaiatec(r.eng_gaiatec || "");
        setEngCliente(r.eng_cliente || "");
        setInicio(r.periodo_inicio || "");
        setFim(r.periodo_fim || "");
        setEndereco(r.local_endereco || "");
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

  useEffect(() => {
    return () => novasRef.current.forEach((n) => URL.revokeObjectURL(n.preview));
  }, []);

  function capturarGps() {
    if (!navigator.geolocation) {
      toast.error("GPS não disponível neste dispositivo.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsBusy(false);
        toast.success("Localização capturada.");
      },
      () => {
        setGpsBusy(false);
        toast.error("Não foi possível capturar a localização.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    if (!cliente.trim() || !contrato.trim()) {
      toast.error("Preencha o cliente e o nº do contrato para continuar.");
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function irParaEtapa(n: number) {
    if (n === 2 && (!cliente.trim() || !contrato.trim())) {
      toast.error("Preencha o cliente e o nº do contrato primeiro.");
      return;
    }
    setStep(n);
  }

  async function salvar(status: RdoStatus) {
    if (status === "finalizado" && (!cliente.trim() || !contrato.trim())) {
      toast.error("Preencha o cliente e o nº do contrato para finalizar.");
      setStep(1);
      return;
    }
    setSaving(status);
    try {
      const input = {
        cliente: cliente.trim(),
        contrato: contrato.trim(),
        eng_gaiatec: engGaiatec.trim() || null,
        eng_cliente: engCliente.trim() || null,
        periodo_inicio: inicio || null,
        periodo_fim: fim || null,
        local_endereco: endereco.trim() || null,
        local_lat: lat,
        local_lng: lng,
        comentarios: comentarios.trim() || null,
      };
      let rid = id;
      if (rid) await updateRelatorio(rid, input, status, origStatus === "finalizado");
      else rid = (await createRelatorio(input, status)).id;

      if (novasFotos.length) {
        await uploadFotos(rid, novasFotos.map((n) => n.file), fotosExistentes.length);
        novasFotos.forEach((n) => URL.revokeObjectURL(n.preview));
      }
      toast.success(status === "finalizado" ? "Relatório finalizado." : "Rascunho salvo.");
      navigate("/relatorio-de-obra");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AppShell showNav={false}>
        <div className="flex justify-center py-24">
          <span className="rdo-spin h-6 w-6 rounded-full border-2 border-[var(--rdo-line-strong)] border-t-[var(--rdo-orange)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell showNav={false}>
      <Toaster position="top-center" />

      <button
        onClick={() => navigate("/relatorio-de-obra")}
        className="text-[13px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
      >
        ← Relatórios
      </button>

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rdo-ink-3)]">
          Relatório Diário de Obra
        </p>
        <h1 className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.035em] text-[var(--rdo-ink)]">
          {isEdit ? "Editar Relatório" : "Novo Relatório"}
        </h1>
      </div>

      {/* Stepper */}
      <div className="mt-7 flex max-w-3xl items-center gap-4">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-4">
            <button onClick={() => irParaEtapa(s.n)} className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center text-[11px] font-semibold transition-colors ${
                  step === s.n
                    ? "bg-[var(--rdo-orange)] text-white"
                    : step > s.n
                      ? "bg-[var(--rdo-ink)] text-white"
                      : "border border-[var(--rdo-line-strong)] text-[var(--rdo-ink-3)]"
                }`}
              >
                {String(s.n).padStart(2, "0")}
              </span>
              <span
                className={`text-[13px] transition-colors ${
                  step === s.n ? "font-semibold text-[var(--rdo-ink)]" : "font-medium text-[var(--rdo-ink-3)]"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--rdo-line)]" />}
          </div>
        ))}
      </div>

      <div className="mt-2 max-w-3xl overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <FormSection title="Dados do Contrato">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Labeled label="Nome do Cliente" required>
                    <input className={inputClass} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex: Empresa ABC" />
                  </Labeled>
                  <Labeled label="Nº do Contrato" required>
                    <input className={inputClass} value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="Ex: CT-2026-001" />
                  </Labeled>
                </div>
              </FormSection>

              <div className="mt-8">
                <FormSection title="Engenheiros Responsáveis">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Labeled label="Eng. Gaiatec">
                      <input className={inputClass} value={engGaiatec} onChange={(e) => setEngGaiatec(e.target.value)} placeholder="Nome do engenheiro" />
                    </Labeled>
                    <Labeled label="Eng. Cliente">
                      <input className={inputClass} value={engCliente} onChange={(e) => setEngCliente(e.target.value)} placeholder="Nome do engenheiro" />
                    </Labeled>
                  </div>
                </FormSection>
              </div>

              <div className="mt-8">
                <FormSection title="Período dos Trabalhos">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Labeled label="Início">
                      <DateTimeField value={inicio} onChange={setInicio} placeholder="Data e hora de início" />
                    </Labeled>
                    <Labeled label="Término">
                      <DateTimeField value={fim} onChange={setFim} placeholder="Data e hora de término" />
                    </Labeled>
                  </div>
                </FormSection>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <FormSection title="Localização da Obra">
                <button type="button" onClick={capturarGps} disabled={gpsBusy} className={`w-full ${ghostBtn}`}>
                  {gpsBusy ? "Capturando…" : "Capturar localização (GPS)"}
                </button>
                {lat != null && lng != null && (
                  <div className="mt-3 flex items-center justify-between border-l-2 border-[var(--rdo-blue)] bg-[var(--rdo-bg-2)] py-2 pl-3 pr-3 text-[13px]">
                    <span className="font-medium text-[var(--rdo-ink-2)]">
                      {lat.toFixed(6)}, {lng.toFixed(6)}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setLat(null); setLng(null); }}
                      className="text-[12px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
                    >
                      remover
                    </button>
                  </div>
                )}
                <input
                  className={`${inputClass} mt-3`}
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Ou digite o endereço manualmente"
                />
              </FormSection>

              <div className="mt-8">
                <FormSection title="Registro Fotográfico">
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => cameraRef.current?.click()} className={ghostBtn.replace("px-6 ", "")}>
                      Câmera
                    </button>
                    <button type="button" onClick={() => galeriaRef.current?.click()} className={ghostBtn.replace("px-6 ", "")}>
                      Galeria
                    </button>
                  </div>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
                  <input ref={galeriaRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />

                  {(fotosExistentes.length > 0 || novasFotos.length > 0) && (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {fotosExistentes.map((f) => (
                        <Thumb key={f.id} src={f.url!} onRemove={() => removerExistente(f)} />
                      ))}
                      {novasFotos.map((n, i) => (
                        <Thumb key={n.preview} src={n.preview} badge="Nova" onRemove={() => removerNova(i)} />
                      ))}
                    </div>
                  )}
                </FormSection>
              </div>

              <div className="mt-8">
                <FormSection title="Comentários e Observações">
                  <textarea
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                    rows={4}
                    className={`${inputClass} resize-y`}
                    placeholder="Descreva as atividades realizadas, condições climáticas, ocorrências…"
                  />
                </FormSection>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ações */}
      <div className="mt-8 flex max-w-3xl flex-col gap-3 border-t border-[var(--rdo-line)] pt-8 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => salvar("rascunho")}
          disabled={saving !== null}
          className={ghostBtn}
        >
          {saving === "rascunho" ? "Salvando…" : "Salvar rascunho"}
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
            <button
              type="button"
              onClick={() => salvar("finalizado")}
              disabled={saving !== null}
              className={primaryBtn}
            >
              {saving === "finalizado" ? "Finalizando…" : "Finalizar"}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Thumb({ src, onRemove, badge }: { src: string; onRemove: () => void; badge?: string }) {
  return (
    <div className="group relative aspect-square overflow-hidden border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)]">
      <img src={src} alt="" className="h-full w-full object-cover" />
      {badge && (
        <span className="absolute left-0 top-0 bg-[var(--rdo-orange)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          {badge}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover foto"
        className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-black/55 text-[14px] leading-none text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
