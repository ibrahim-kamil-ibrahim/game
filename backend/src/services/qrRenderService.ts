import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { decryptSecret } from '../utils/crypto';
import { qrImagePayload } from './qrService';

export async function getActiveQrPayload(machineId: string, businessId: string) {
  const machine = await prisma.gameMachine.findFirst({
    where: { id: machineId, businessId, deletedAt: null },
    include: {
      qrCodes: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 },
      business: { select: { name: true } },
    },
  });
  if (!machine) throw AppError.notFound('Machine', 'MACHINE_NOT_FOUND');
  const active = machine.qrCodes[0];
  if (!active) throw AppError.notFound('QR code', 'QR_NOT_FOUND');

  let secret: string;
  try {
    secret = decryptSecret(active.tokenEncrypted);
  } catch {
    throw AppError.internal('The stored QR code could not be decoded');
  }

  return {
    machine,
    payload: qrImagePayload(secret),
    version: active.version,
  };
}

export async function renderQrPng(machineId: string, businessId: string) {
  const { machine, payload, version } = await getActiveQrPayload(machineId, businessId);
  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 1024,
    margin: 3,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1F3A', light: '#FFFFFF' },
  });
  return {
    buffer,
    filename: `${machine.code}-qr-v${version}.png`,
    machineName: machine.name,
    machineCode: machine.code,
  };
}

export async function renderQrPdf(machineId: string, businessId: string) {
  const { machine, payload, version } = await getActiveQrPayload(machineId, businessId);
  const png = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1F3A', light: '#FFFFFF' },
  });

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${machine.name} QR Code` } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.rect(0, 0, doc.page.width, 110).fill('#0B1F3A');
  doc.fillColor('#FFFFFF').fontSize(24).text(machine.business.name, 50, 38);
  doc.fontSize(12).fillColor('#A9C4E4').text('Game Machine QR Code', 50, 72);
  doc.fillColor('#0B1F3A');
  doc.fontSize(26).text(machine.name, 50, 150);
  doc.fontSize(13).fillColor('#4A5B70').text(`Code: ${machine.code}   •   QR version ${version}`, 50, 186);

  const imageSize = 320;
  const x = (doc.page.width - imageSize) / 2;
  doc.image(png, x, 230, { fit: [imageSize, imageSize] });
  doc
    .fontSize(11)
    .fillColor('#4A5B70')
    .text('Scan this code with the Employer mobile application to start a session.', 50, 580, {
      align: 'center',
      width: doc.page.width - 100,
    });
  doc
    .fontSize(9)
    .fillColor('#8A9BB0')
    .text('This QR code is unique to this machine. Regenerating it invalidates the code printed above.', 50, 610, {
      align: 'center',
      width: doc.page.width - 100,
    });

  doc.end();
  const buffer = await finished;

  return {
    buffer,
    filename: `${machine.code}-qr-v${version}.pdf`,
    machineName: machine.name,
    machineCode: machine.code,
  };
}

export async function getQrInfo(machineId: string, businessId: string) {
  const { machine, payload, version } = await getActiveQrPayload(machineId, businessId);
  return { machineId, machineName: machine.name, machineCode: machine.code, version, payload };
}
