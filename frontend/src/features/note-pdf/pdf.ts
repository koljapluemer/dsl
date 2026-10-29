import { queryOptions } from '@tanstack/react-query';
import { api, enc, readResponse } from '@/api/client';
import type { PdfStatus } from '@/api/types';

export type PdfContent = 'both' | 'body' | 'extra';
export type PdfPaper = 'A4' | 'Letter';
export type PdfOptions = { content: PdfContent; images: boolean; paper: PdfPaper };

/** Whether notes can be exported as PDFs here (Chromium; not on Termux). */
export const pdfStatusQuery = queryOptions({
  queryKey: ['pdf', 'status'], queryFn: () => api<PdfStatus>('GET', '/api/pdf/status'), staleTime: 60_000,
});

/** The saved note printed as a PDF, saved by the browser as a download. */
export async function downloadPdf(file: string, { content, images, paper }: PdfOptions) {
  const query = new URLSearchParams({ content, images: images ? '1' : '0', paper });
  const res = await fetch(`/api/items/${enc(file)}/pdf?${query}`);
  if (!res.ok) await readResponse(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${file.replace(/\.txt$/, '')}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
