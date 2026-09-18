document.body.dataset.ok = 'rel'
document.body.dataset.style = getComputedStyle(document.body).getPropertyValue('--fixture-style').trim() || 'missing'
