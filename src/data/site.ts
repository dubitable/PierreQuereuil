export const site = {
  name: 'Pierre Quereuil',
  tagline: 'Software and great opinions.',
  links: [
    { label: 'GitHub', href: 'https://github.com/pierrequereuil' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pierre-quereuil/' },
    { label: 'Email', href: 'mailto:hello@example.com' },
  ],
} as const

export type Link = (typeof site.links)[number]
