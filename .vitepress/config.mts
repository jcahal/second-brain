import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Jon\'s Second Brain',
  description: 'Personal knowledge base — annotated reference sheets for languages & tools.',
  base: '/second-brain/',
  srcExclude: ['CLAUDE.md'],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Python', link: '/python/' },
      { text: 'Git', link: '/git/' },
      { text: 'AWS', link: '/aws/ec2-docker-compose' },
    ],

    sidebar: [
      {
        text: 'Python',
        link: '/python/',
        items: [
          { text: 'Core Language', link: '/python/core' },
          {
            text: 'Libraries',
            items: [
              { text: 'FastAPI', link: '/python/fastapi' },
              { text: 'Pydantic v2', link: '/python/pydantic' },
              { text: 'joblib', link: '/python/joblib' },
              { text: 'MLflow', link: '/python/mlflow' },
            ],
          },
        ],
      },
      {
        text: 'Git',
        link: '/git/',
        items: [
          { text: 'Conventional Commits', link: '/git/conventional-commits' },
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
