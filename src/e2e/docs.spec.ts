import { expect, test } from '@playwright/test'

test('文档侧栏序号按实际生效顺序连续编号', async ({ page }) => {
  await page.goto('http://localhost:4173/docs')

  const items = page.locator('aside nav[aria-label="文档列表"] a')
  await expect(items).toHaveCount(4)
  // frontmatter order 是 10/20/30/40（留了插入间隔），页面展示的是实际位次 01–04
  await expect(items).toHaveText([
    '01关于本站',
    '02提交作品指南',
    '03站内运行作品指南',
    '04常见问题与审核标准'
  ])
})
