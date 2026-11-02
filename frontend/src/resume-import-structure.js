const SECTION_RULES = [
  { type: 'summary', title: 'Professional Summary', names: ['summary', 'professional summary', 'profile summary', 'professional profile summary', 'profile', 'professional profile', 'career profile', 'objective', 'career objective', 'about me'] },
  { type: 'experience', title: 'Work Experience', names: ['experience', 'work experience', 'professional experience', 'relevant experience', 'career experience', 'employment', 'employment history', 'work history', 'career history', 'job history', 'professional background', 'internship experience', 'internships'] },
  { type: 'education', title: 'Education', names: ['education', 'educational background', 'academic background', 'academic qualifications', 'qualifications'] },
  { type: 'skills', title: 'Skills', names: ['skills', 'technical skills', 'core skills', 'core competencies', 'key skills', 'areas of expertise', 'areas of strength', 'expertise', 'competencies'] },
  { type: 'projects', title: 'Projects', names: ['projects', 'selected projects', 'key projects', 'personal projects', 'project experience', 'academic projects', 'project highlights', 'portfolio projects'] },
  { type: 'certifications', title: 'Certifications', names: ['certification', 'certifications', 'certificates', 'licenses', 'licenses and certifications', 'training and certifications', 'professional certifications'] },
  { type: 'custom', title: 'Awards', names: ['awards', 'awards and recognition', 'honors', 'honours', 'honors and awards', 'achievements', 'accomplishments'] },
  { type: 'custom', title: 'Languages', names: ['languages', 'language skills'] },
  { type: 'custom', title: 'Publications', names: ['publications', 'research'] },
  { type: 'custom', title: 'Volunteer Experience', names: ['volunteer experience', 'volunteering', 'community involvement'] },
  { type: 'custom', title: 'Leadership', names: ['leadership', 'leadership experience'] },
  { type: 'custom', title: 'Career Highlights', names: ['career highlights', 'professional highlights', 'key achievements', 'professional achievements'] },
  { type: 'custom', title: 'Professional Affiliations', names: ['professional affiliations', 'memberships', 'associations'] },
  { type: 'custom', title: 'Professional Development', names: ['professional development', 'courses', 'continuing education'] },
  { type: 'custom', title: 'Additional Information', names: ['additional information', 'technical proficiencies', 'tools and technologies', 'interests', 'hobbies and interests', 'activities', 'references', 'training'] }
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;
const URL_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i;
const DATE_PATTERN = /\b(?:19|20)\d{2}\b|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}\b|present|current/i;
const DATE_VALUE_PATTERN = /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}(?:\s*(?:-|–|—|to)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}|\s*(?:-|–|—|to)\s*(?:present|current)|\s+(?:present|current))?\b/i;

function normalizedHeading(line) {
  return line.trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*\d{1,2}\s*[.)-]\s*/, '')
    .replace(/^[\s•●▪◦‣*–—-]+|[\s:|•●▪◦‣*–—-]+$/g, '')
    .replace(/[&+]/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findSectionRule(line) {
  const heading = normalizedHeading(line);
  return SECTION_RULES.find(rule => rule.names.includes(heading)) || null;
}

function findInlineSection(line) {
  for (const rule of SECTION_RULES) {
    for (const name of rule.names) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`^\\s*(?:#{1,6}\\s*)?(?:\\d{1,2}\\s*[.)-]\\s*)?${escapedName}\\s*[:|\\-–—•]\\s*(.*)$`, 'i').exec(line);
      if (match) return { rule, remainder: match[1].trim() };
    }
  }
  return null;
}

function inferredCustomHeading(line, allowTitleCase = false) {
  if (/^\s*[•●▪◦‣*–—-]/.test(line)) return null;
  const heading = line.trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*\d{1,2}\s*[.)-]\s*/, '')
    .replace(/[:|]+$/, '')
    .trim();
  if (!heading || heading.length > 60 || heading.split(/\s+/).length > 7 || /[.!?,@/]/.test(heading)) return null;
  const letters = heading.replace(/[^\p{L}]/gu, '');
  const words = heading.match(/[\p{L}\p{N}]+/gu) || [];
  const isUppercase = letters.length >= 3 && letters === letters.toLocaleUpperCase();
  const lowercaseHeadingWords = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'with']);
  const isTitleCase = allowTitleCase && words.length >= 2 && words.every(word => {
    const first = Array.from(word)[0];
    return lowercaseHeadingWords.has(word.toLocaleLowerCase()) || first === first.toLocaleUpperCase();
  });
  if (!isUppercase && !isTitleCase) return null;
  return { type: 'custom', title: heading.replace(/\b[a-z]/g, character => character.toUpperCase()), names: [] };
}

function findInlineCustomSection(line) {
  const match = /^\s*(?:#{1,6}\s*)?(?:\d{1,2}\s*[.)-]\s*)?([^:|]{2,60})\s*:\s*(.+)$/.exec(line);
  if (!match) return null;
  const rule = findSectionRule(match[1]) || inferredCustomHeading(match[1], true);
  return rule ? { rule, remainder: match[2].trim() } : null;
}

function contactCandidates(lines) {
  return lines.flatMap((line, lineIndex) => line
    .split(/\s*(?:\||•|·|;|\t)\s*/)
    .map(text => ({ text: text.trim(), lineIndex }))
    .filter(candidate => candidate.text))
    .map((candidate, index) => ({ ...candidate, index }));
}

function detectContact(candidates) {
  const profile = { name: '', headline: '', email: '', phone: '', location: '', website: '' };
  const used = new Set();
  const markCandidate = candidate => used.add(candidate.index);
  const emailCandidate = candidates.find(candidate => EMAIL_PATTERN.test(candidate.text));
  if (emailCandidate) {
    profile.email = emailCandidate.text.match(EMAIL_PATTERN)[0];
    markCandidate(emailCandidate);
  }
  const phoneCandidate = candidates.find(candidate => PHONE_PATTERN.test(candidate.text) && !EMAIL_PATTERN.test(candidate.text));
  if (phoneCandidate) {
    profile.phone = phoneCandidate.text.match(PHONE_PATTERN)[0].trim();
    markCandidate(phoneCandidate);
  }
  const websiteCandidate = candidates.find(candidate => URL_PATTERN.test(candidate.text) && !EMAIL_PATTERN.test(candidate.text));
  if (websiteCandidate) {
    profile.website = websiteCandidate.text.match(URL_PATTERN)[0];
    markCandidate(websiteCandidate);
  }
  const remaining = candidates
    .filter(candidate => !used.has(candidate.index))
    .map(candidate => ({
      ...candidate,
      text: candidate.text
        .replace(EMAIL_PATTERN, '')
        .replace(PHONE_PATTERN, '')
        .replace(URL_PATTERN, '')
        .replace(/^(?:e-?mail|phone|mobile|tel|website|linkedin|location)\s*:\s*/i, '')
        .trim()
    }))
    .filter(candidate => candidate.text);
  const nameCandidate = remaining.find(candidate => candidate.text.length <= 80 && !/[.!?]/.test(candidate.text));
  if (nameCandidate) {
    profile.name = nameCandidate.text;
    markCandidate(nameCandidate);
  }
  const headlineCandidate = remaining.find(candidate => !used.has(candidate.index) && candidate.text.length <= 120 && !/[.!?]/.test(candidate.text));
  if (headlineCandidate) {
    profile.headline = headlineCandidate.text;
    markCandidate(headlineCandidate);
  }
  const locationCandidate = remaining.find(candidate => !used.has(candidate.index) && /,\s*(?:[A-Z][a-z]|[A-Z]{2}\b)/.test(candidate.text) && candidate.text.length <= 100);
  if (locationCandidate) {
    profile.location = locationCandidate.text;
    markCandidate(locationCandidate);
  }
  return {
    profile,
    remaining: remaining.filter(candidate => !used.has(candidate.index)).map(candidate => candidate.text)
  };
}

function cleanContentLine(line) {
  return line.trim().replace(/^(?:[•●▪◦‣*–—-]|\d+[.)])\s*/, '');
}

function summaryParagraph(lines) {
  return lines.map(cleanContentLine).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function splitEntryGroups(lines) {
  const groups = [];
  let group = [];
  const flush = () => {
    if (group.some(line => line.trim())) groups.push(group);
    group = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const isBullet = /^(?:[•●▪◦‣*–—-]|\d+[.)])\s*/.test(line);
    if (!isBullet && group.some(item => DATE_VALUE_PATTERN.test(item)) && looksLikeEntryHeading(line)) flush();
    group.push(line);
  }
  flush();
  return groups.reduce((merged, current) => {
    const previous = merged.at(-1);
    const onlyBullets = current.every(line => /^(?:[•●▪◦‣*–—-]|\d+[.)])\s*/.test(line.trim()));
    const plainDescription = current.every(line => /[.!?]["')\]]*$/.test(cleanContentLine(line)));
    if (previous && !current.some(line => DATE_VALUE_PATTERN.test(line)) && (onlyBullets || plainDescription)) {
      previous.push(...current);
    } else {
      merged.push([...current]);
    }
    return merged;
  }, []);
}

function looksLikeEntryHeading(line) {
  const cleaned = cleanContentLine(line);
  return cleaned.length <= 100 && !/[.!?]$/.test(cleaned) && !/^(?:and|or|with|including|responsible for|achieved|delivered|built|created|developed|led|managed|improved|implemented|designed|supported|leading|managing|building|creating|developing|designing|improving|delivering|collaborating|implementing|supporting|mentoring|driving|coordinating|reducing|increasing|streamlining|overseeing|handling|working|helping|engineered|architected|spearheaded|launched|executed|established|automated|optimized|introduced|migrated|resolved|maintained|owned|partnered|contributed)\b/i.test(cleaned);
}

function splitRoleCompany(value) {
  const text = value.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const separator = /\s+(?:\||·|•|—|–|-|at|@)\s+/i;
  const match = separator.exec(text);
  if (!match) return [text, ''];
  return [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()];
}

function parseEntries(lines) {
  return splitEntryGroups(lines).map(group => {
    let date = '';
    const fields = [];
    const details = [];
    for (const rawLine of group) {
      const isBullet = /^(?:[•●▪◦‣*–—-]|\d+[.)])\s*/.test(rawLine.trim());
      const line = cleanContentLine(rawLine);
      if (!line) continue;
      if (isBullet) {
        details.push(line);
        continue;
      }
      const match = DATE_VALUE_PATTERN.exec(line);
      if (match && !date) date = match[0].trim();
      const withoutDate = match ? line.slice(0, match.index) + line.slice(match.index + match[0].length) : line;
      if (fields.length && /[.!?]["')\]]*$/.test(withoutDate.trim())) {
        details.push(line);
        continue;
      }
      const values = withoutDate.split(/\s*(?:\||·|•)\s*/).map(value => value.trim().replace(/^[,;–—-]+|[,;–—-]+$/g, '')).filter(Boolean);
      fields.push(...values);
    }
    const [role, inlineCompany] = splitRoleCompany(fields.shift() || '');
    const company = inlineCompany || fields.shift() || '';
    details.push(...fields);
    return {
      role,
      company,
      date,
      details: details.join(' ').replace(/\s+/g, ' ').trim()
    };
  });
}

export function parseResumeText(sourceText, filename = 'Imported resume') {
  const source = String(sourceText ?? '').replace(/\r\n?/g, '\n');
  if (new TextEncoder().encode(source).length > 200_000) throw new Error('The extracted resume text exceeds the supported size.');
  const text = source.replace(/\u0000/g, '').trim();
  if (!text) throw new Error('No readable resume text was found.');

  const sections = [];
  const headerLines = [];
  let activeSection = null;
  const sourceLines = text.split('\n');
  for (const [lineIndex, line] of sourceLines.entries()) {
    const rule = findSectionRule(line);
    const inline = rule ? null : findInlineSection(line) || findInlineCustomSection(line);
    const markedHeading = /^\s*(?:#{1,6}|\d{1,2}\s*[.)-])/.test(line);
    const previousLineBlank = lineIndex > 0 && !sourceLines[lineIndex - 1].trim();
    const allowTitleCase = markedHeading
      || ((previousLineBlank || activeSection?.type === 'summary')
        && !['experience', 'education', 'projects', 'skills'].includes(activeSection?.type));
    const inferred = lineIndex >= 2 || markedHeading
      ? inferredCustomHeading(line, allowTitleCase)
      : null;
    const sectionRule = rule || inline?.rule || inferred;
    if (sectionRule) {
      activeSection = { type: sectionRule.type, title: sectionRule.title, lines: [] };
      sections.push(activeSection);
      if (inline?.remainder) activeSection.lines.push(inline.remainder);
    } else if (activeSection) activeSection.lines.push(line);
    else headerLines.push(line);
  }

  const { profile, remaining: introLines } = detectContact(contactCandidates(headerLines));
  if (!profile.name && introLines.length) profile.name = introLines.shift().trim();
  if (!profile.headline && introLines.length && !sections.some(section => section.type === 'summary')) profile.headline = '';

  const parsedSections = [];
  for (const section of sections) {
    const content = section.lines.map(line => line.trim()).filter(Boolean);
    if (!content.length) continue;
    if (section.type === 'experience' || section.type === 'education' || section.type === 'projects') {
      const entries = parseEntries(section.lines);
      if (entries.length) parsedSections.push({ ...section, listStyle: 'none', entries });
      else parsedSections.push({ ...section, listStyle: 'none', entries: [{ role: content.join(' '), company: '', date: '', details: '' }] });
    } else {
      const sectionContent = section.type === 'summary'
        ? summaryParagraph(section.lines)
        : section.lines.map(cleanContentLine).filter(Boolean).join(section.type === 'skills' ? '\n' : ' ');
      parsedSections.push({
        ...section,
        listStyle: 'none',
        content: sectionContent
      });
    }
  }

  if (introLines.length && !parsedSections.some(section => section.type === 'summary')) {
    parsedSections.unshift({ type: 'summary', title: 'Professional Summary', listStyle: 'none', content: summaryParagraph(introLines) });
  }
  if (!parsedSections.length) {
    parsedSections.push({ type: 'custom', title: 'Imported Resume Content', listStyle: 'none', content: text.replace(/\s+/g, ' ').trim() });
  }

  const basename = String(filename).replace(/\.[^.]+$/, '').trim();
  return {
    docName: basename || 'Imported resume',
    profile,
    sections: parsedSections,
    sourceText: source
  };
}
