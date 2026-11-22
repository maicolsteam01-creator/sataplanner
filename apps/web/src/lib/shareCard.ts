import { slug } from './export';

export interface ShareCardLabels {
  subtitle: string;
  nodes: string;
  power: string;
  scan: string;
  footer: string;
}

export interface ShareCardInfo {
  name: string;
  nodeCount: number;
  power: number;
  labels: ShareCardLabels;
}

const MONO = 'Consolas, "Courier New", ui-monospace, monospace';
const SANS = '"Segoe UI", Inter, system-ui, sans-serif';

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
};

/** Genera una tarjeta PNG con el QR del link comprimido (sin servidor). */
export async function buildShareCard(link: string, info: ShareCardInfo): Promise<Blob> {
  const QRCode = (await import('qrcode')).default;
  const qr = await QRCode.toDataURL(link, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
    color: { dark: '#E6F3FF', light: '#081521' },
  });

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('QR image failed'));
    image.src = qr;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');

  ctx.fillStyle = '#081724';
  ctx.fillRect(0, 0, 1200, 630);

  ctx.strokeStyle = 'rgba(20, 55, 79, 0.55)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 630);
    ctx.stroke();
  }
  for (let y = 0; y <= 630; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(1200, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = '#1C4666';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 1152, 582);
  ctx.strokeStyle = '#14374F';
  ctx.lineWidth = 1;
  ctx.strokeRect(32, 32, 1136, 566);

  ctx.fillStyle = '#7FD1FF';
  ctx.font = `600 12px ${MONO}`;
  ctx.fillText('SATAPLANNER · BLUEPRINT SHARE', 64, 74);

  ctx.fillStyle = '#E6F3FF';
  ctx.font = `700 46px ${SANS}`;
  const titleLines = wrap(ctx, info.name || 'SataPlanner', 600);
  titleLines.forEach((line, index) => ctx.fillText(line, 64, 140 + index * 56));

  const bodyY = 140 + titleLines.length * 56 + 18;
  ctx.fillStyle = '#FFB347';
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText(info.labels.subtitle, 64, bodyY);

  ctx.fillStyle = '#8AA6BC';
  ctx.font = `13px ${MONO}`;
  ctx.fillText(`${info.labels.nodes}: ${info.nodeCount}    ${info.labels.power}: ${Math.round(info.power)} MW`, 64, bodyY + 40);

  ctx.fillStyle = '#7FD1FF';
  ctx.fillRect(64, 500, 560, 1);
  ctx.fillStyle = '#587791';
  ctx.font = `11px ${MONO}`;
  ctx.fillText(info.labels.footer, 64, 530);

  // Panel del QR
  ctx.fillStyle = 'rgba(11, 33, 51, 0.92)';
  ctx.fillRect(720, 110, 416, 416);
  ctx.strokeStyle = '#2E6E93';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(720, 110, 416, 416);

  ctx.fillStyle = '#7FD1FF';
  ctx.font = `600 11px ${MONO}`;
  ctx.fillText('QR · PLAN DATA', 744, 140);

  ctx.fillStyle = '#081521';
  ctx.fillRect(768, 158, 320, 320);
  ctx.drawImage(image, 768, 158, 320, 320);

  ctx.fillStyle = '#8AA6BC';
  ctx.font = `11px ${MONO}`;
  ctx.fillText(info.labels.scan, 744, 504);

  ctx.fillStyle = '#587791';
  ctx.font = `10px ${MONO}`;
  ctx.fillText(`${slug(info.name)} · local-first · no backend`, 64, 586);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No PNG blob'));
    }, 'image/png');
  });
}
