"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkle, Gift, Trophy, Check, ArrowsClockwise } from "@/lib/ui/icons";
import { type MinigamePrize, drawMinigamePrize, computeLuckyWheelTargetRotationDeg } from "@/lib/engagement/minigames";

interface WheelOfFortuneProps {
  prizes: MinigamePrize[];
  headline?: string;
  onWinPrize?: (prize: MinigamePrize, lead: { name: string; phone: string; email: string }) => void;
}

export function WheelOfFortune({
  prizes,
  headline = "Gire a Roleta e Ganhe Prêmios!",
  onWinPrize,
}: WheelOfFortuneProps) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<MinigamePrize | null>(null);

  // Formulário de captação de lead
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [leadCollected, setLeadCollected] = useState(false);

  const segmentCount = prizes.length;
  const sliceAngle = 360 / segmentCount;

  const handleSpin = () => {
    if (spinning || wonPrize) return;

    setSpinning(true);
    // Realiza o sorteio ponderado no motor
    const selectedPrize = drawMinigamePrize(prizes);
    const targetIndex = prizes.findIndex((p) => p.id === selectedPrize.id);

    const nextRotation = computeLuckyWheelTargetRotationDeg(
      rotation,
      segmentCount,
      targetIndex >= 0 ? targetIndex : 0,
      6
    );

    setRotation(nextRotation);

    setTimeout(() => {
      setSpinning(false);
      setWonPrize(selectedPrize);
      if (onWinPrize) {
        onWinPrize(selectedPrize, { name, phone, email });
      }
    }, 4500); // tempo que bate com a animação CSS (4.5s cubic-bezier)
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border border-border bg-card p-6 shadow-xl text-center">
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Sparkle className="h-3.5 w-3.5" />
        Gamificação & Prêmios
      </div>

      <h3 className="text-xl font-bold tracking-tight text-foreground">{headline}</h3>

      {!leadCollected ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && (phone.trim() || email.trim())) {
              setLeadCollected(true);
            }
          }}
          className="mt-4 w-full space-y-3 text-left"
        >
          <div className="space-y-1">
            <Label className="text-xs font-medium">Seu Nome</Label>
            <Input
              required
              placeholder="Ex: Carlos Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">WhatsApp</Label>
            <Input
              required
              placeholder="Ex: (11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <Button type="submit" className="w-full mt-2 gap-2">
            <Gift className="h-4 w-4" />
            Liberar Minha Rodada Grátis
          </Button>
        </form>
      ) : (
        <div className="relative mt-6 flex flex-col items-center">
          {/* Ponteiro Superior da Roleta */}
          <div className="absolute -top-3 z-20 h-0 w-0 border-x-8 border-x-transparent border-t-[18px] border-t-red-600 drop-shadow-md" />

          {/* Disco da Roleta SVG com CSS Transition suave */}
          <div className="relative h-64 w-64 overflow-hidden rounded-full border-4 border-amber-400 shadow-2xl">
            <svg
              viewBox="0 0 100 100"
              className="h-full w-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? "transform 4.5s cubic-bezier(0.15, 0.9, 0.25, 1)" : "none",
              }}
            >
              {prizes.map((prize, i) => {
                const startAngle = i * sliceAngle;
                const endAngle = (i + 1) * sliceAngle;

                const x1 = 50 + 50 * Math.cos((Math.PI * (startAngle - 90)) / 180);
                const y1 = 50 + 50 * Math.sin((Math.PI * (startAngle - 90)) / 180);
                const x2 = 50 + 50 * Math.cos((Math.PI * (endAngle - 90)) / 180);
                const y2 = 50 + 50 * Math.sin((Math.PI * (endAngle - 90)) / 180);

                const largeArcFlag = sliceAngle > 180 ? 1 : 0;
                const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                return (
                  <g key={prize.id}>
                    <path d={pathData} fill={prize.color || (i % 2 === 0 ? "#3b82f6" : "#6366f1")} />
                    <text
                      x="50"
                      y="18"
                      fill="#ffffff"
                      fontSize="4.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      transform={`rotate(${startAngle + sliceAngle / 2}, 50, 50)`}
                    >
                      {prize.label.length > 12 ? `${prize.label.slice(0, 11)}…` : prize.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Centro da Roleta */}
            <div className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border-2 border-amber-400 font-black text-xs text-amber-600">
              ★
            </div>
          </div>

          {/* Resultado ou Botão de Girar */}
          {wonPrize ? (
            <div className="mt-5 w-full rounded-xl bg-amber-500/10 p-4 border border-amber-500/30 text-center animate-in zoom-in-95">
              <Trophy className="mx-auto h-8 w-8 text-amber-500 mb-1" />
              <h4 className="font-bold text-foreground">Parabéns, {name.split(" ")[0]}!</h4>
              <p className="text-sm font-semibold text-primary mt-1">{wonPrize.label}</p>
              {wonPrize.couponCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1 font-mono text-xs font-bold border">
                  Cupom: <span className="text-emerald-600">{wonPrize.couponCode}</span>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Enviamos os detalhes do seu prêmio também para o seu WhatsApp!
              </p>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={spinning}
              onClick={handleSpin}
              className="mt-5 w-full gap-2 text-base font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25"
            >
              <ArrowsClockwise className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`} />
              {spinning ? "Girando a Roleta..." : "Girar Roleta Agora!"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
