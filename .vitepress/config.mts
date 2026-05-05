import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Jon\'s Second Brain',
  description: 'Personal knowledge base — annotated reference sheets for languages & tools.',
  base: '/second-brain/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Python', link: '/python/' },
      { text: 'AWS', link: '/aws/ec2-docker-compose' },
    ],

    sidebar: [
      {
        text: 'Python',
        link: '/python/',
        items: [
          { text: 'Core Language', link: '/python/core' },
        ],
      },
      {
        text: 'AWS',
        items: [
          { text: 'EC2 + Docker Compose', link: '/aws/ec2-docker-compose' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jcahal/second-brain' },
    ],

    footer: {
      message: 'Personal reference — second brain.',
    },

    search: {
      provider: 'local',
    },
  },
})
