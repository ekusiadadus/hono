import type { Context } from './context'
import type { Next } from './hono'
import { Hono } from './hono'
import { poweredBy } from './middleware/powered-by'

describe('GET Request', () => {
  const app = new Hono()

  app.get('/hello', async () => {
    return new Response('hello', {
      status: 200,
      statusText: 'Hono is OK',
    })
  })

  app.get('/hello-with-shortcuts', (c) => {
    c.header('X-Custom', 'This is Hono')
    c.status(201)
    return c.html('<h1>Hono!!!</h1>')
  })

  it('GET /hello is ok', async () => {
    const res = await app.request('http://localhost/hello')
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(res.statusText).toBe('Hono is OK')
    expect(await res.text()).toBe('hello')
  })

  it('GET /hello-with-shortcuts is ok', async () => {
    const res = await app.request('http://localhost/hello-with-shortcuts')
    expect(res).not.toBeNull()
    expect(res.status).toBe(201)
    expect(res.headers.get('X-Custom')).toBe('This is Hono')
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/)
    expect(await res.text()).toBe('<h1>Hono!!!</h1>')
  })

  it('GET / is not found', async () => {
    const res = await app.request('http://localhost/')
    expect(res).not.toBeNull()
    expect(res.status).toBe(404)
  })
})

describe('strict parameter', () => {
  describe('strict is true with not slash', () => {
    const app = new Hono()

    app.get('/hello', (c) => {
      return c.text('/hello')
    })

    it('/hello/ is not found', async () => {
      let res = await app.request('http://localhost/hello')
      expect(res).not.toBeNull()
      expect(res.status).toBe(200)
      res = await app.request('http://localhost/hello/')
      expect(res).not.toBeNull()
      expect(res.status).toBe(404)
    })
  })

  describe('strict is true with slash', () => {
    const app = new Hono()

    app.get('/hello/', (c) => {
      return c.text('/hello/')
    })

    it('/hello is not found', async () => {
      let res = await app.request('http://localhost/hello/')
      expect(res).not.toBeNull()
      expect(res.status).toBe(200)
      res = await app.request('http://localhost/hello')
      expect(res).not.toBeNull()
      expect(res.status).toBe(404)
    })
  })

  describe('strict is false', () => {
    const app = new Hono({ strict: false })

    app.get('/hello', (c) => {
      return c.text('/hello')
    })

    it('/hello and /hello/ are treated as the same', async () => {
      let res = await app.request('http://localhost/hello')
      expect(res).not.toBeNull()
      expect(res.status).toBe(200)
      res = await app.request('http://localhost/hello/')
      expect(res).not.toBeNull()
      expect(res.status).toBe(200)
    })
  })
})

describe('Routing', () => {
  const app = new Hono()

  it('Return it self', async () => {
    const app2 = app.get('/', () => new Response('get /'))
    expect(app2).not.toBeUndefined()
    app2.delete('/', () => new Response('delete /'))

    let res = await app2.request('http://localhost/', { method: 'GET' })
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('get /')

    res = await app2.request('http://localhost/', { method: 'DELETE' })
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('delete /')
  })

  it('Nested route', async () => {
    const book = app.route('/book')
    book.get('/', (c) => c.text('get /book'))
    book.get('/:id', (c) => {
      return c.text('get /book/' + c.req.param('id'))
    })
    book.post('/', (c) => c.text('post /book'))

    const user = app.route('/user')
    user.get('/login', (c) => c.text('get /user/login'))
    user.post('/register', (c) => c.text('post /user/register'))

    let res = await app.request('http://localhost/book', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('get /book')

    res = await app.request('http://localhost/book/123', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('get /book/123')

    res = await app.request('http://localhost/book', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('post /book')

    res = await app.request('http://localhost/book/', { method: 'GET' })
    expect(res.status).toBe(404)

    res = await app.request('http://localhost/user/login', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('get /user/login')

    res = await app.request('http://localhost/user/register', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('post /user/register')
  })

  describe('Chained route', () => {
    app
      .get('/chained/:abc', (c) => {
        const abc = c.req.param('abc')
        return c.text(`GET for ${abc}`)
      })
      .post((c) => {
        const abc = c.req.param('abc')
        return c.text(`POST for ${abc}`)
      })
    it('Should return 200 response from GET request', async () => {
      const res = await app.request('http://localhost/chained/abc', { method: 'GET' })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET for abc')
    })
    it('Should return 200 response from POST request', async () => {
      const res = await app.request('http://localhost/chained/abc', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('POST for abc')
    })
    it('Should return 404 response from PUT request', async () => {
      const res = await app.request('http://localhost/chained/abc', { method: 'PUT' })
      expect(res.status).toBe(404)
    })
  })
})

describe('param and query', () => {
  const apps: Record<string, Hono> = {}
  apps['get by name'] = (() => {
    const app = new Hono()

    app.get('/entry/:id', (c) => {
      const id = c.req.param('id')
      return c.text(`id is ${id}`)
    })

    app.get('/date/:date{[0-9]+}', (c) => {
      const date = c.req.param('date')
      return c.text(`date is ${date}`)
    })

    app.get('/search', (c) => {
      const name = c.req.query('name')
      return c.text(`name is ${name}`)
    })

    app.get('/multiple-values', (c) => {
      const queries = c.req.queries('q')
      const limit = c.req.queries('limit')
      return c.text(`q is ${queries[0]} and ${queries[1]}, limit is ${limit[0]}`)
    })

    app.get('/add-header', (c) => {
      const bar = c.req.header('X-Foo')
      return c.text(`foo is ${bar}`)
    })

    return app
  })()

  apps['get all as an object'] = (() => {
    const app = new Hono()

    app.get('/entry/:id', (c) => {
      const { id } = c.req.param()
      return c.text(`id is ${id}`)
    })

    app.get('/date/:date{[0-9]+}', (c) => {
      const { date } = c.req.param()
      return c.text(`date is ${date}`)
    })

    app.get('/search', (c) => {
      const { name } = c.req.query()
      return c.text(`name is ${name}`)
    })

    app.get('/multiple-values', (c) => {
      const { q, limit } = c.req.queries()
      return c.text(`q is ${q[0]} and ${q[1]}, limit is ${limit[0]}`)
    })

    app.get('/add-header', (c) => {
      const { 'x-foo': bar } = c.req.header()
      return c.text(`foo is ${bar}`)
    })

    return app
  })()

  describe.each(Object.keys(apps))('%s', (name) => {
    const app = apps[name]

    it('param of /entry/:id is found', async () => {
      const res = await app.request('http://localhost/entry/123')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('id is 123')
    })

    it('param of /date/:date is found', async () => {
      const res = await app.request('http://localhost/date/0401')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('date is 0401')
    })

    it('query of /search?name=sam is found', async () => {
      const res = await app.request('http://localhost/search?name=sam')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('name is sam')
    })

    it('query of /search?name=sam&name=tom is found', async () => {
      const res = await app.request('http://localhost/search?name=sam&name=tom')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('name is sam')
    })

    it('query of /multiple-values?q=foo&q=bar&limit=10 is found', async () => {
      const res = await app.request('http://localhost/multiple-values?q=foo&q=bar&limit=10')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('q is foo and bar, limit is 10')
    })

    it('/add-header header - X-Foo is Bar', async () => {
      const req = new Request('http://localhost/add-header')
      req.headers.append('X-Foo', 'Bar')
      const res = await app.request(req)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('foo is Bar')
    })
  })
})

describe('Middleware', () => {
  describe('Basic', () => {
    const app = new Hono()

    // Custom Logger
    app.use('*', async (c, next) => {
      console.log(`${c.req.method} : ${c.req.url}`)
      await next()
    })

    // Append Custom Header
    app.use('*', async (c, next) => {
      await next()
      c.res.headers.append('x-custom', 'root')
    })

    app.use('/hello', async (c, next) => {
      await next()
      c.res.headers.append('x-message', 'custom-header')
    })

    app.use('/hello/*', async (c, next) => {
      await next()
      c.res.headers.append('x-message-2', 'custom-header-2')
    })

    app.get('/hello', (c) => {
      return c.text('hello')
    })

    app.get('/hello/:message', (c) => {
      const message = c.req.param('message')
      return c.text(`${message}`)
    })

    app.get('/error', () => {
      throw new Error('Error!')
    })

    app.notFound((c) => {
      return c.text('Not Found Foo', 404)
    })

    it('logging and custom header', async () => {
      const res = await app.request('http://localhost/hello')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('hello')
      expect(res.headers.get('x-custom')).toBe('root')
      expect(res.headers.get('x-message')).toBe('custom-header')
      expect(res.headers.get('x-message-2')).toBe('custom-header-2')
    })

    it('logging and custom header with named param', async () => {
      const res = await app.request('http://localhost/hello/message')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('message')
      expect(res.headers.get('x-custom')).toBe('root')
      expect(res.headers.get('x-message-2')).toBe('custom-header-2')
    })

    it('not found', async () => {
      const res = await app.request('http://localhost/foo')
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found Foo')
    })

    it('internal server error', async () => {
      const res = await app.request('http://localhost/error')
      expect(res.status).toBe(500)
      console.log(await res.text())
    })
  })

  describe('Chained route', () => {
    const app = new Hono()
    app
      .use('/chained/*', async (c, next) => {
        c.req.headers.append('x-before', 'abc')
        await next()
      })
      .use(async (c, next) => {
        await next()
        c.header('x-after', c.req.header('x-before'))
      })
      .get('/chained/abc', (c) => {
        return c.text('GET chained')
      })
    it('GET /chained/abc', async () => {
      const res = await app.request('http://localhost/chained/abc')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET chained')
      expect(res.headers.get('x-after')).toBe('abc')
    })
  })

  describe('Multiple handler', () => {
    const app = new Hono()
    app
      .use(
        '/multiple/*',
        async (c, next) => {
          c.req.headers.append('x-before', 'abc')
          await next()
        },
        async (c, next) => {
          await next()
          c.header('x-after', c.req.header('x-before'))
        }
      )
      .get('/multiple/abc', (c) => {
        return c.text('GET multiple')
      })
    it('GET /multiple/abc', async () => {
      const res = await app.request('http://localhost/multiple/abc')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET multiple')
      expect(res.headers.get('x-after')).toBe('abc')
    })
  })
})

describe('Builtin Middleware', () => {
  const app = new Hono()
  app.use('/abc', poweredBy())
  app.use('/def', async (c, next) => {
    const middleware = poweredBy()
    await middleware(c, next)
  })
  app.get('/abc', () => new Response())
  app.get('/def', () => new Response())

  it('"powered-by" middleware', async () => {
    const res = await app.request('http://localhost/abc')
    expect(res.headers.get('x-powered-by')).toBe('Hono')
  })

  it('"powered-by" middleware in a handler', async () => {
    const res = await app.request('http://localhost/def')
    expect(res.headers.get('x-powered-by')).toBe('Hono')
  })
})

describe('Middleware with app.HTTP_METHOD', () => {
  describe('Basic', () => {
    const app = new Hono()

    app.all('*', async (c, next) => {
      c.header('x-before-dispatch', 'foo')
      await next()
      c.header('x-custom-message', 'hello')
    })

    const customHeader = async (c: Context, next: Next) => {
      c.req.headers.append('x-custom-foo', 'bar')
      await next()
    }

    const customHeader2 = async (c: Context, next: Next) => {
      await next()
      c.header('x-custom-foo-2', 'bar-2')
    }

    app
      .get('/abc', customHeader, (c) => {
        const foo = c.req.header('x-custom-foo') || ''
        return c.text(foo)
      })
      .post(customHeader2, (c) => {
        return c.text('POST /abc')
      })

    it('GET /abc', async () => {
      const res = await app.request('http://localhost/abc')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-custom-message')).toBe('hello')
      expect(res.headers.get('x-before-dispatch')).toBe('foo')
      expect(await res.text()).toBe('bar')
    })
    it('POST /abc', async () => {
      const res = await app.request('http://localhost/abc', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('POST /abc')
      expect(res.headers.get('x-custom-foo-2')).toBe('bar-2')
    })
  })

  describe('With builtin middleware', () => {
    const app = new Hono()
    app.get('/abc', poweredBy(), (c) => {
      return c.text('GET /abc')
    })
    it('GET /abc', async () => {
      const res = await app.request('http://localhost/abc')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET /abc')
      expect(res.headers.get('x-powered-by')).toBe('Hono')
    })
  })
})

describe('Not Found', () => {
  const app = new Hono()

  app.notFound((c) => {
    return c.text('Custom 404 Not Found', 404)
  })

  app.get('/hello', (c) => {
    return c.text('hello')
  })

  app.get('/notfound', (c) => {
    return c.notFound()
  })

  it('Custom 404 Not Found', async () => {
    let res = await app.request('http://localhost/hello')
    expect(res.status).toBe(200)
    res = await app.request('http://localhost/notfound')
    expect(res.status).toBe(404)
    res = await app.request('http://localhost/foo')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Custom 404 Not Found')
  })
})

describe('Redirect', () => {
  const app = new Hono()
  app.get('/redirect', (c) => {
    return c.redirect('/')
  })

  it('Absolute URL', async () => {
    const res = await app.request('https://example.com/redirect')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/')
  })
})

describe('Error handle', () => {
  const app = new Hono()

  app.get('/error', () => {
    throw new Error('This is Error')
  })

  app.use('/error-middleware', async () => {
    throw new Error('This is Middleware Error')
  })

  app.onError((err, c) => {
    c.header('x-debug', err.message)
    return c.text('Custom Error Message', 500)
  })

  it('Custom Error Message', async () => {
    let res = await app.request('https://example.com/error')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Custom Error Message')
    expect(res.headers.get('x-debug')).toBe('This is Error')

    res = await app.request('https://example.com/error-middleware')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Custom Error Message')
    expect(res.headers.get('x-debug')).toBe('This is Middleware Error')
  })
})

describe('Request methods with custom middleware', () => {
  const app = new Hono()

  app.use('*', async (c, next) => {
    const query = c.req.query('foo')
    const param = c.req.param('foo')
    const header = c.req.header('User-Agent')
    await next()
    c.header('X-Query-2', query)
    c.header('X-Param-2', param)
    c.header('X-Header-2', header)
  })

  app.get('/:foo', (c) => {
    const query = c.req.query('foo')
    const param = c.req.param('foo')
    const header = c.req.header('User-Agent')
    c.header('X-Query', query)
    c.header('X-Param', param)
    c.header('X-Header', header)
    return c.body('Hono')
  })

  it('query', async () => {
    const url = new URL('http://localhost/bar')
    url.searchParams.append('foo', 'bar')
    const req = new Request(url.toString())
    req.headers.append('User-Agent', 'bar')
    const res = await app.request(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Query')).toBe('bar')
    expect(res.headers.get('X-Param')).toBe('bar')
    expect(res.headers.get('X-Header')).toBe('bar')

    expect(res.headers.get('X-Query-2')).toBe('bar')
    expect(res.headers.get('X-Param-2')).toBe('bar')
    expect(res.headers.get('X-Header-2')).toBe('bar')
  })
})

describe('Hono with `app.route`', () => {
  describe('Basic', () => {
    const app = new Hono()
    const api = new Hono()
    const middleware = new Hono()

    api.use('*', async (c, next) => {
      await next()
      c.res.headers.append('x-custom-a', 'a')
    })

    api.get('/posts', (c) => c.text('List'))
    api.post('/posts', (c) => c.text('Create'))
    api.get('/posts/:id', (c) => c.text(`GET ${c.req.param('id')}`))

    middleware.use('*', async (c, next) => {
      await next()
      c.res.headers.append('x-custom-b', 'b')
    })

    app.route('/api', middleware)
    app.route('/api', api)

    app.get('/foo', (c) => c.text('bar'))

    it('Should return not found response', async () => {
      const res = await app.request('http://localhost/')
      expect(res.status).toBe(404)
    })

    it('Should return not found response', async () => {
      const res = await app.request('http://localhost/posts')
      expect(res.status).toBe(404)
    })

    test('GET /api/posts', async () => {
      const res = await app.request('http://localhost/api/posts')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('List')
    })

    test('Custom header by middleware', async () => {
      const res = await app.request('http://localhost/api/posts')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-custom-a')).toBe('a')
      expect(res.headers.get('x-custom-b')).toBe('b')
    })

    test('POST /api/posts', async () => {
      const res = await app.request('http://localhost/api/posts', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('Create')
    })

    test('GET /api/posts/123', async () => {
      const res = await app.request('http://localhost/api/posts/123')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET 123')
    })

    test('GET /foo', async () => {
      const res = await app.request('http://localhost/foo')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('bar')
    })
  })

  describe('Chaining', () => {
    const app = new Hono()
    const route = new Hono()
    route.get('/post', (c) => c.text('GET /POST v2')).post((c) => c.text('POST /POST v2'))
    app.route('/v2', route)

    it('Should return 200 response - GET /v2/post', async () => {
      const res = await app.request('http://localhost/v2/post')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('GET /POST v2')
    })

    it('Should return 200 response - POST /v2/post', async () => {
      const res = await app.request('http://localhost/v2/post', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('POST /POST v2')
    })

    it('Should return 404 response - DELETE /v2/post', async () => {
      const res = await app.request('http://localhost/v2/post', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })

  describe('Nested', () => {
    const app = new Hono()
    const api = new Hono()
    const book = new Hono()

    book.get('/', (c) => c.text('list books'))
    book.get('/:id', (c) => c.text(`book ${c.req.param('id')}`))

    api.get('/', (c) => c.text('this is API'))
    api.route('/book', book)

    app.get('/', (c) => c.text('root'))
    app.route('/v2', api)

    it('Should return 200 response - GET /', async () => {
      const res = await app.request('http://localhost/')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('root')
    })

    it('Should return 200 response - GET /v2', async () => {
      const res = await app.request('http://localhost/v2')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('this is API')
    })

    it('Should return 200 response - GET /v2/book', async () => {
      const res = await app.request('http://localhost/v2/book')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('list books')
    })

    it('Should return 200 response - GET /v2/book/123', async () => {
      const res = await app.request('http://localhost/v2/book/123')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('book 123')
    })
  })
})

describe('Multiple handler', () => {
  describe('handler + handler', () => {
    const app = new Hono()

    app.get('/posts/:id', (c) => {
      const id = c.req.param('id')
      c.header('foo', 'bar')
      return c.text(`id is ${id}`)
    })

    app.get('/:type/:id', (c) => {
      c.status(404)
      c.header('foo2', 'bar2')
      return c.text('foo')
    })
    it('Should return response from `specialized` route', async () => {
      const res = await app.request('http://localhost/posts/123')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('id is 123')
      expect(res.headers.get('foo')).toBe('bar')
      expect(res.headers.get('foo2')).toBeNull()
    })
  })

  describe('Duplicate param name', () => {
    it('self', () => {
      const app = new Hono()
      expect(() => {
        app.get('/:id/:id', (c) => {
          const id = c.req.param('id')
          return c.text(`id is ${id}`)
        })
      }).toThrowError(/Duplicate param name/)
    })

    it('parent', () => {
      const app = new Hono()
      app.get('/:id/:action', (c) => {
        return c.text('foo')
      })
      expect(() => {
        app.get('/posts/:id', (c) => {
          const id = c.req.param('id')
          return c.text(`id is ${id}`)
        })
      }).toThrowError(/Duplicate param name/)
    })

    it('child', () => {
      const app = new Hono()
      app.get('/posts/:id', (c) => {
        return c.text('foo')
      })
      expect(() => {
        app.get('/:id/:action', (c) => {
          const id = c.req.param('id')
          return c.text(`id is ${id}`)
        })
      }).toThrowError(/Duplicate param name/)
    })

    it('hierarchy', () => {
      const app = new Hono()
      app.get('/posts/:id/comments/:comment_id', (c) => {
        return c.text('foo')
      })
      expect(() => {
        app.get('/posts/:id', (c) => {
          const id = c.req.param('id')
          return c.text(`id is ${id}`)
        })
      }).not.toThrow()
    })

    it('different regular expression', () => {
      const app = new Hono()
      app.get('/:id/:action{create|update}', (c) => {
        return c.text('foo')
      })
      expect(() => {
        app.get('/:id/:action{delete}', (c) => {
          const id = c.req.param('id')
          return c.text(`id is ${id}`)
        })
      }).not.toThrow()
    })
  })
})

describe('Multiple handler - async', () => {
  describe('handler + handler', () => {
    const app = new Hono()
    app.get('/posts/:id', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      c.header('foo2', 'bar2')
      const id = c.req.param('id')
      return c.text(`id is ${id}`)
    })
    app.get('/:type/:id', async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      c.header('foo', 'bar')
      c.status(404)
      return c.text('foo')
    })

    it('Should return response from `specialized` route', async () => {
      const res = await app.request('http://localhost/posts/123')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('id is 123')
      expect(res.headers.get('foo')).toBeNull()
      expect(res.headers.get('foo2')).toBe('bar2')
    })
  })
})

describe('Context is not finalized', () => {
  it('should throw error - lack `await next()`', async () => {
    const app = new Hono()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    app.use('*', () => {})
    app.get('/foo', (c) => {
      return c.text('foo')
    })
    app.onError((err, c) => {
      return c.text(err.message, 500)
    })
    const res = await app.request('http://localhost/foo')
    expect(res.status).toBe(500)
    expect(await res.text()).toMatch(/^Context is not finalized/)
  })

  it('should throw error - lack `returning Response`', async () => {
    const app = new Hono()
    app.use('*', async (_c, next) => {
      await next()
    })
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    app.get('/foo', () => {})
    app.onError((err, c) => {
      return c.text(err.message, 500)
    })
    const res = await app.request('http://localhost/foo')
    expect(res.status).toBe(500)
    expect(await res.text()).toMatch(/^Context is not finalized/)
  })
})

describe('Cookie', () => {
  describe('Parse cookie', () => {
    const apps: Record<string, Hono> = {}
    apps['get by name'] = (() => {
      const app = new Hono()

      app.get('/cookie', (c) => {
        const yummyCookie = c.req.cookie('yummy_cookie')
        const tastyCookie = c.req.cookie('tasty_cookie')
        const res = new Response('Good cookie')
        res.headers.set('Yummy-Cookie', yummyCookie)
        res.headers.set('Tasty-Cookie', tastyCookie)
        return res
      })

      return app
    })()

    apps['get all as an object'] = (() => {
      const app = new Hono()

      app.get('/cookie', (c) => {
        const { yummy_cookie: yummyCookie, tasty_cookie: tastyCookie } = c.req.cookie()
        const res = new Response('Good cookie')
        res.headers.set('Yummy-Cookie', yummyCookie)
        res.headers.set('Tasty-Cookie', tastyCookie)
        return res
      })

      return app
    })()

    describe.each(Object.keys(apps))('%s', (name) => {
      const app = apps[name]
      it('Parse cookie on c.req.cookie', async () => {
        const req = new Request('http://localhost/cookie')
        const cookieString = 'yummy_cookie=choco; tasty_cookie = strawberry '
        req.headers.set('Cookie', cookieString)
        const res = await app.request(req)

        expect(res.headers.get('Yummy-Cookie')).toBe('choco')
        expect(res.headers.get('Tasty-Cookie')).toBe('strawberry')
      })
    })
  })

  describe('Set cookie', () => {
    const app = new Hono()

    app.get('/set-cookie', (c) => {
      c.cookie('delicious_cookie', 'macha')
      return c.text('Give cookie')
    })

    it('Set cookie on c.cookie', async () => {
      const res = await app.request('http://localhost/set-cookie')
      expect(res.status).toBe(200)
      const header = res.headers.get('Set-Cookie')
      expect(header).toBe('delicious_cookie=macha')
    })

    app.get('/set-cookie-complex', (c) => {
      c.cookie('great_cookie', 'banana', {
        path: '/',
        secure: true,
        domain: 'example.com',
        httpOnly: true,
        maxAge: 1000,
        expires: new Date(Date.UTC(2000, 11, 24, 10, 30, 59, 900)),
        sameSite: 'Strict',
      })
      return c.text('Give cookie')
    })

    it('Complex pattern', async () => {
      const res = await app.request('http://localhost/set-cookie-complex')
      expect(res.status).toBe(200)
      const header = res.headers.get('Set-Cookie')
      expect(header).toBe(
        'great_cookie=banana; Max-Age=1000; Domain=example.com; Path=/; Expires=Sun, 24 Dec 2000 10:30:59 GMT; HttpOnly; Secure; SameSite=Strict'
      )
    })
  })
})

describe('Parse Body', () => {
  const app = new Hono()

  app.post('/json', async (c) => {
    return c.json(await c.req.parseBody(), 200)
  })
  app.post('/text', async (c) => {
    return c.text((await c.req.parseBody()) as string, 200)
  })
  app.post('/form', async (c) => {
    return c.json(await c.req.parseBody(), 200)
  })

  it('POST with JSON', async () => {
    const payload = { message: 'hello hono' }
    const req = new Request('http://localhost/json', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    })
    const res = await app.request(req)
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await req.parseBody()).toEqual(payload)
    expect(await res.json()).toEqual(payload)
  })

  it('POST with text', async () => {
    const payload = 'hello'
    const req = new Request('http://localhost/text', {
      method: 'POST',
      body: 'hello',
      headers: new Headers({ 'Content-Type': 'application/text' }),
    })
    const res = await app.request(req)
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await req.parseBody()).toEqual(payload)
    expect(await res.text()).toEqual(payload)
  })

  it('POST with form', async () => {
    const formData = new URLSearchParams()
    formData.append('message', 'hello')
    const req = new Request('https://localhost/form', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const res = await app.request(req)
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await req.parseBody()).toEqual({ message: 'hello' })
    expect(await res.json()).toEqual({ message: 'hello' })
  })
})

describe('Both two middleware returning response', () => {
  it('Should return correct Content-Type`', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      await next()
      return c.html('Foo')
    })
    app.get('/', (c) => {
      return c.text('Bar')
    })
    const res = await app.request('http://localhost/')
    expect(res).not.toBeNull()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Bar')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=UTF-8')
  })
})
