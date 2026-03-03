"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import jsQR from "jsqr";
import {
  Package, QrCode, Camera, CheckCircle, XCircle,
  Keyboard, Loader2, UserCheck, RotateCcw,
} from "lucide-react";

type Step = "scan" | "manual" | "found" | "camera" | "confirm" | "success" | "error";

interface DeliveryData {
  id: string;
  code: string;
  status: string;
  user: { id: string; name: string; phone: string; photoUrl?: string };
  unit: { number: string; block?: string; type: string };
  location: { code: string; description?: string };
  createdAt: string;
}

export default function TotemPage() {
  const [step, setStep] = useState<Step>("scan");
  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef<boolean>(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Inactivity timer - back to scan after 60s
  const inactivityRef = useRef<NodeJS.Timeout | null>(null);
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      stopCamera();
      resetState();
      setStep("scan");
    }, 60000);
  }, []);

  // Start camera on mount (directly in scan mode)
  useEffect(() => {
    startCamera("environment").then(() => startQrScanning());
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      stopQrScanning();
      stopCamera();
    };
  }, []);

  // Manage camera based on step changes
  useEffect(() => {
    resetInactivity();
    if (step === "scan") {
      startCamera("environment").then(() => startQrScanning());
      setShowManualInput(false);
    } else {
      stopQrScanning();
    }
  }, [step]);

  function resetState() {
    setDelivery(null);
    setManualCode("");
    setCapturedPhoto(null);
    setCapturedBlob(null);
    setError("");
    setShowManualInput(false);
  }

  // =================== CAMERA ===================
  async function startCamera(facingMode: "environment" | "user" = "environment") {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  }

  function stopCamera() {
    stopQrScanning();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // =================== QR SCANNING ===================
  function startQrScanning() {
    if (scanIntervalRef.current) return; // já está rodando
    scanningRef.current = true;
    setScanStatus("Procurando QR Code...");

    scanIntervalRef.current = setInterval(() => {
      if (!scanningRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return; // vídeo não pronto

      if (!scanCanvasRef.current) {
        scanCanvasRef.current = document.createElement("canvas");
      }
      const canvas = scanCanvasRef.current!;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return;

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const qrResult = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });

      if (qrResult && qrResult.data) {
        const code = qrResult.data.trim();
        const now = Date.now();

        // Evitar leitura duplicada do mesmo código em 5s
        if (code === lastScannedRef.current && now - lastScannedTimeRef.current < 5000) {
          return;
        }

        lastScannedRef.current = code;
        lastScannedTimeRef.current = now;
        setScanStatus(`QR lido: ${code}`);
        stopQrScanning();
        searchDelivery(code);
      }
    }, 250); // escaneia 4x por segundo
  }

  function stopQrScanning() {
    scanningRef.current = false;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setScanStatus("");
  }

  function captureFrame(): { dataUrl: string; blob: Blob } | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: "image/jpeg" });

    return { dataUrl, blob };
  }

  // =================== FLOW ===================
  async function searchDelivery(code: string) {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    resetInactivity();
    try {
      const result = await api.totemFindByCode(code.trim());
      if (result.status === "WITHDRAWN") {
        setError("Esta encomenda já foi retirada.");
        setStep("error");
      } else {
        stopCamera();
        setDelivery(result);
        setStep("found");
      }
    } catch (err: any) {
      setError(err.message || "Encomenda não encontrada");
      setStep("error");
    }
    setLoading(false);
  }

  async function startPersonCapture() {
    setStep("camera");
    resetInactivity();
    await startCamera("user");
  }

  function takePersonPhoto() {
    const result = captureFrame();
    if (result) {
      setCapturedPhoto(result.dataUrl);
      setCapturedBlob(result.blob);
      stopCamera();
      setStep("confirm");
    }
    resetInactivity();
  }

  async function confirmWithdraw() {
    if (!delivery) return;
    setLoading(true);
    resetInactivity();
    try {
      const file = capturedBlob
        ? new File([capturedBlob], "withdraw-photo.jpg", { type: "image/jpeg" })
        : undefined;
      await api.totemWithdraw(delivery.code, file);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Erro ao confirmar retirada");
      setStep("error");
    }
    setLoading(false);
  }

  function goToScan() {
    stopCamera();
    resetState();
    lastScannedRef.current = "";
    lastScannedTimeRef.current = 0;
    setStep("scan");
  }

  // =================== RENDER ===================
  return (
    <div className="h-screen w-screen overflow-hidden" onClick={resetInactivity}>
      <canvas ref={canvasRef} className="hidden" />

      {/* ===== SCAN: Tela principal - câmera 70% + painel lateral 30% ===== */}
      {step === "scan" && (
        <div className="flex h-full w-full">
          {/* Câmera - 70% da tela */}
          <div className="relative h-full" style={{ width: "70%" }}>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />

            {/* QR Frame overlay - posicionado na lateral direita */}
            <div className="absolute inset-0 flex items-center justify-end pr-[8%]">
              <div className="relative">
                {/* QR frame animado */}
                <div className="relative h-56 w-56 rounded-2xl border-4 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)] lg:h-72 lg:w-72">
                  {/* Cantos decorativos */}
                  <div className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-blue-300" />
                  <div className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-blue-300" />
                  <div className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-blue-300" />
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-blue-300" />

                  {/* Linha de scan animada */}
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
                    style={{ animation: "scanLine 2s ease-in-out infinite" }}
                  />
                </div>

                {/* Label embaixo do frame */}
                <div className="mt-3 text-center">
                  <p className="text-sm font-medium text-blue-300 drop-shadow-lg">
                    {loading ? "Buscando encomenda..." : scanStatus || "Posicione o QR Code aqui"}
                  </p>
                  {loading && <Loader2 className="mx-auto mt-2 h-5 w-5 animate-spin text-blue-400" />}
                </div>
              </div>
            </div>

            {/* Overlay escuro nas bordas */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
          </div>

          {/* Painel lateral - 30% */}
          <div className="flex h-full flex-col items-center justify-between bg-slate-900 p-6" style={{ width: "30%" }}>
            {/* Topo - Logo e título */}
            <div className="flex flex-col items-center gap-4 pt-8">
              <div className="rounded-full bg-blue-600/20 p-4">
                <Package className="h-12 w-12 text-blue-400" />
              </div>
              <h1 className="text-center text-2xl font-bold lg:text-3xl">
                Retirada de<br />Encomendas
              </h1>
              <p className="text-center text-sm text-slate-400 lg:text-base">
                Posicione a encomenda com o QR Code visível na câmera
              </p>
            </div>

            {/* Centro - Instruções visuais */}
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-5 py-3">
                <QrCode className="h-8 w-8 shrink-0 text-blue-400" />
                <div>
                  <p className="text-sm font-semibold">Escaneie o QR Code</p>
                  <p className="text-xs text-slate-400">da etiqueta da encomenda</p>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-700" />

              <button
                onClick={() => setShowManualInput(true)}
                className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-5 py-3 transition-colors hover:bg-slate-700"
              >
                <Keyboard className="h-8 w-8 shrink-0 text-slate-400" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Digitar Código</p>
                  <p className="text-xs text-slate-400">manualmente</p>
                </div>
              </button>
            </div>

            {/* Bottom - Input manual (aparece ao clicar) */}
            <div className="w-full pb-8">
              {showManualInput ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    autoFocus
                    className="w-full rounded-xl bg-slate-700 px-4 py-3 text-center text-lg font-mono text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ENC-XXXXX-XXXX"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && searchDelivery(manualCode)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => searchDelivery(manualCode)}
                      disabled={!manualCode.trim() || loading}
                      className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Buscar"}
                    </button>
                    <button
                      onClick={() => { setShowManualInput(false); setManualCode(""); }}
                      className="rounded-xl bg-slate-700 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-600">
                  Sistema de retirada automática de encomendas
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== FOUND: Encomenda encontrada - confirmação de identidade ===== */}
      {step === "found" && delivery && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
          <Package className="h-16 w-16 text-green-400" />
          <h2 className="text-3xl font-bold">Encomenda Encontrada</h2>

          <div className="w-full max-w-md rounded-2xl bg-slate-700/50 p-8 space-y-4">
            <div className="flex items-center gap-5">
              {delivery.user.photoUrl ? (
                <img
                  src={delivery.user.photoUrl}
                  alt="Morador"
                  className="h-24 w-24 rounded-full border-3 border-blue-400 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-600">
                  <UserCheck className="h-12 w-12 text-slate-400" />
                </div>
              )}
              <div>
                <p className="text-2xl font-bold">{delivery.user.name}</p>
                <p className="text-lg text-slate-300">
                  {delivery.unit.type} {delivery.unit.number}
                  {delivery.unit.block ? ` - Bloco ${delivery.unit.block}` : ""}
                </p>
              </div>
            </div>

            <hr className="border-slate-600" />

            <div className="space-y-2 text-base">
              <p><span className="text-slate-400">Código:</span> <span className="font-mono">{delivery.code}</span></p>
              <p><span className="text-slate-400">Local:</span> {delivery.location.code}</p>
              <p><span className="text-slate-400">Recebida em:</span> {new Date(delivery.createdAt).toLocaleString("pt-BR")}</p>
            </div>
          </div>

          <p className="text-xl text-slate-300">
            Você é <strong>{delivery.user.name}</strong>?
          </p>

          <div className="flex w-full max-w-md gap-4">
            <button
              onClick={startPersonCapture}
              className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-green-600 px-6 py-5 text-xl font-semibold hover:bg-green-700"
            >
              <CheckCircle className="h-7 w-7" />
              Sim, sou eu
            </button>
            <button
              onClick={goToScan}
              className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-red-600 px-6 py-5 text-xl font-semibold hover:bg-red-700"
            >
              <XCircle className="h-7 w-7" />
              Não
            </button>
          </div>
        </div>
      )}

      {/* ===== CAMERA: Captura de foto da pessoa ===== */}
      {step === "camera" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-6">
          <h2 className="text-2xl font-bold">Posicione seu rosto na câmera</h2>
          <p className="text-slate-300">Uma foto será tirada para registro da retirada</p>

          <div className="relative w-full max-w-lg flex-1 max-h-[60vh] rounded-2xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Face guide oval */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-72 w-52 rounded-[50%] border-4 border-blue-400 opacity-50" />
            </div>
          </div>

          <button
            onClick={takePersonPhoto}
            className="flex w-full max-w-lg items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-5 text-xl font-semibold hover:bg-blue-700 active:scale-95 transition-transform"
          >
            <Camera className="h-7 w-7" />
            Tirar Foto
          </button>

          <button onClick={goToScan} className="text-slate-400 hover:text-white">
            ← Cancelar
          </button>
        </div>
      )}

      {/* ===== CONFIRM: Revisão da foto + confirmação ===== */}
      {step === "confirm" && delivery && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
          <UserCheck className="h-14 w-14 text-green-400" />
          <h2 className="text-3xl font-bold">Confirmar Retirada</h2>

          <div className="flex flex-col items-center gap-4">
            {capturedPhoto && (
              <img
                src={capturedPhoto}
                alt="Foto capturada"
                className="h-52 w-52 rounded-full border-4 border-green-400 object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            )}
            <p className="text-xl"><strong>{delivery.user.name}</strong></p>
            <p className="font-mono text-slate-400">{delivery.code}</p>
          </div>

          <div className="flex w-full max-w-md gap-4">
            <button
              onClick={confirmWithdraw}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-5 text-xl font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle className="h-6 w-6" />}
              Confirmar
            </button>
            <button
              onClick={() => { setCapturedPhoto(null); setCapturedBlob(null); startPersonCapture(); }}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-5 text-lg font-semibold hover:bg-slate-600"
            >
              <RotateCcw className="h-6 w-6" />
              Refazer
            </button>
          </div>

          <button onClick={goToScan} className="text-slate-400 hover:text-white">
            ← Cancelar
          </button>
        </div>
      )}

      {/* ===== SUCCESS ===== */}
      {step === "success" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
          <div className="rounded-full bg-green-600/20 p-8">
            <CheckCircle className="h-28 w-28 text-green-400" />
          </div>
          <h2 className="text-4xl font-bold text-green-400">Encomenda Retirada!</h2>
          <p className="text-2xl text-slate-300">Retire sua encomenda no local indicado.</p>
          {delivery && (
            <p className="font-mono text-lg text-slate-400">{delivery.code}</p>
          )}

          <button
            onClick={goToScan}
            className="mt-6 rounded-2xl bg-blue-600 px-12 py-4 text-xl font-semibold hover:bg-blue-700"
          >
            Voltar ao Início
          </button>
          <AutoRedirect onTimeout={goToScan} seconds={10} />
        </div>
      )}

      {/* ===== ERROR ===== */}
      {step === "error" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
          <div className="rounded-full bg-red-600/20 p-8">
            <XCircle className="h-28 w-28 text-red-400" />
          </div>
          <h2 className="text-4xl font-bold text-red-400">Ops!</h2>
          <p className="text-2xl text-slate-300">{error || "Algo deu errado"}</p>

          <button
            onClick={goToScan}
            className="mt-6 rounded-2xl bg-blue-600 px-12 py-4 text-xl font-semibold hover:bg-blue-700"
          >
            Tentar Novamente
          </button>
          <AutoRedirect onTimeout={goToScan} seconds={10} />
        </div>
      )}

      {/* CSS for scan line animation */}
      <style jsx global>{`
        @keyframes scanLine {
          0%, 100% { top: 20%; }
          50% { top: 80%; }
        }
      `}</style>
    </div>
  );
}

function AutoRedirect({ onTimeout, seconds }: { onTimeout: () => void; seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onTimeout, seconds]);

  return (
    <p className="text-sm text-slate-500">
      Voltando ao início em {remaining}s...
    </p>
  );
}
