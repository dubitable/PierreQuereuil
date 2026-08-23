export const site = {
  name: 'Pierre Quereuil',
  tagline: 'Software and great opinions.',
  links: [
    { label: 'GitHub', href: 'https://github.com/dubitable' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pierrequereuil/' },
    { label: 'Email', href: 'mailto:pierrequereuil@gmail.com' },
  ],
} as const

export type Link = (typeof site.links)[number]
