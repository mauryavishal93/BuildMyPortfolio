function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
}

function isPlaceholder(value) {
  const text = String(value || '').trim();
  return !text || /^(?:name surname|name and surname|your name|professional title|university name|example(?:\s+.*)?|previous company|organization|add\b.*|job title|skill one|skill two)$/i.test(text);
}

export function buildCoverLetterDraft({
  name = '',
  headline = '',
  email = '',
  phone = '',
  location = '',
  jobTitle = '',
  company = '',
  jobDescription = '',
  summary = '',
  skills = [],
  experience = [],
  date = new Date().toLocaleDateString()
} = {}) {
  const relevantSkills = [...new Set(skills
    .map(skill => String(skill || '').trim())
    .filter(skill => skill && !isPlaceholder(skill) && normalizeText(jobDescription).includes(normalizeText(skill))))].slice(0, 5);
  const realSummary = isPlaceholder(summary) ? '' : String(summary).trim();
  const recentRole = experience.find(entry => !isPlaceholder(entry?.role) && !isPlaceholder(entry?.details));
  const details = String(recentRole?.details || '').split(/\n+/).map(line => line.trim()).filter(line => line && !isPlaceholder(line)).slice(0, 2);
  const role = String(jobTitle || '').trim() || 'the open position';
  const companyName = String(company || '').trim();
  const headlineText = isPlaceholder(headline) ? '' : String(headline).trim();
  const recipient = companyName ? ` at ${companyName}` : '';
  const paragraphs = [`I am writing to apply for ${role}${recipient}.${headlineText ? ` My background is in ${headlineText}.` : ''}`];

  if (realSummary) paragraphs.push(realSummary);
  if (recentRole && details.length) {
    const employer = isPlaceholder(recentRole.company) ? '' : ` at ${recentRole.company}`;
    paragraphs.push(`In my role as ${recentRole.role}${employer}, my work included:\n${details.map(detail => `- ${detail}`).join('\n')}`);
  }
  if (relevantSkills.length) {
    paragraphs.push(`The role's listed skills also align with my experience in ${relevantSkills.join(', ')}.`);
  }
  paragraphs.push('Thank you for your consideration. I would welcome the opportunity to discuss how my experience could contribute to your team.');

  const contact = [email, phone, location].map(value => String(value || '').trim()).filter(Boolean);
  const header = [String(name || '').trim(), ...contact, String(date || '').trim()].filter(Boolean);
  const signoff = String(name || '').trim();
  return [...header, '', 'Dear Hiring Team,', '', ...paragraphs, '', 'Sincerely,', signoff].join('\n');
}
