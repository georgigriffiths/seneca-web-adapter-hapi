'use strict'

const _ = require('lodash')

module.exports = function hapi (options, context, auth, routes, done) {
  const seneca = this

  if (!context) {
    return done(new Error('no context provided'))
  }

  context.ext('onPreAuth', function (request, reply) {
    reply.seneca = request.seneca = seneca.root.delegate({
      req$: request,
      res$: reply,
      tx$: seneca.root.idgen()
    })
    reply.continue()
  })

  _.each(routes, (route) => {
    if (!route.auth && !route.secure) {
      unsecuredRoute(seneca, context, route)
    }
    else if (route.auth) {
      authRoute(seneca, context, route)
    }
  })

  done(null, {routes: routes})
}


function handleRoute (seneca, request, reply, route) {
  reply.seneca = request.seneca = seneca.root.delegate({
    req$: request,
    res$: reply,
    tx$: seneca.root.idgen()
  })

  var data = _.extend(
    {},
    _.isObject(request.body) ? request.body : {},
    _.isObject(request.params) ? request.params : {},
    _.isObject(request.query) ? request.query : {}
  )

  // This is what the seneca handler will get
  // Note! request$ and response$ will be stripped
  // if the message is sent over transport.
  var payload = {
    req$: request,
    res$: reply,
    data: data
    // args: {
    //   body: body,
    //   route: route,
    //   params: request.params,
    //   query: request.query,
    //   user: request.user || null,
    //   headers: request.headers
    // }
  }
  console.log('Handle Route', route.pattern, payload.data)

  if (route.redirect) {
    return reply.redirect(route.redirect)
  }

  if (route.auth.pass) {
    return reply.redirect(route.auth.pass)
  }

  if (route.build) {
    route.build.call(request, reply, payload, act, reply)
  }
  else {
    act(payload, reply)
  }

  function act (args, reply) {
    reply.seneca.act(route.pattern, args, (err, response) => {
      if (err) {
        return reply(err)
      }

      // if (route.autoreply) {
      //   return reply(null, response)
      // }

      if (!_.isObject(response)) return reply.send(response)

      if (response.http$) {
        var res = _.clone(response.http$)
        delete response.http$
        res.body = response
        response = res
      }
      if (response.redirect) {
        response.statusCode = response.statusCode || response.status || 302
        return reply.redirect(response.redirect)
      }
      response.statusCode = response.statusCode || response.status
      return reply(response.body || response)
    })
  }
}

function unsecuredRoute (seneca, context, route) {
  console.log('ROUTE', route.path)
  context.route({
    method: route.methods,
    path: route.path,
    handler: (request, reply) => {
      handleRoute(seneca, request, reply, route)
    }
  })
}

function authRoute (seneca, context, route) {
  console.log('AUTH_ROUTE', route.path)
  context.route({
    method: route.methods,
    path: route.path,
    config: {
      auth: {
        mode: 'try',
        strategy: route.auth.strategy
      }
    },
    handler: (request, reply) => {
      if (request.auth.error) {
        console.log(request.auth.error)
        reply()
      }
      if (request.auth.isAuthenticated) handleRoute(seneca, request, reply, route)
    }
  })
}
