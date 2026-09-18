document.body.dataset.ok = 'abs'
document.body.dataset.style = getComputedStyle(document.body).getPropertyValue('--fixture-style').trim() || 'missing'
