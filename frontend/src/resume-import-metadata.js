export const RESUME_PDF_METADATA_NAMESPACE = 'https://personacraftpro.com/ns/resume/1.0/';

export function readEmbeddedResumeProject(metadata) {
  const rawData = metadata?.getRaw?.();
  const payload = metadata?.get?.('jspdf:metadata');
  if (typeof rawData !== 'string' || !rawData.includes(`xmlns:jspdf="${RESUME_PDF_METADATA_NAMESPACE}"`) || !payload) return null;

  let record;
  try {
    record = JSON.parse(payload);
  } catch (error) {
    throw new Error('This PersonaCraftPro PDF contains unreadable resume data. Please export it again or import another file.', { cause: error });
  }
  if (record?.format !== 'PersonaCraftProResume' || record.version !== 1 || !record.resume || typeof record.resume !== 'object') {
    throw new Error('This PersonaCraftPro PDF contains an unsupported resume-data version. Please export it again or import another file.');
  }
  return record.resume;
}
