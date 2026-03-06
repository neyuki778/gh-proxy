export default {
    async fetch(request, env) {
      const url = new URL(request.url);
      const githubUrl = 'https://github.com' + url.pathname + url.search;
  
      // 构造新的请求头，保留必要的认证和类型信息
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Host', 'github.com');
      newHeaders.set('Origin', 'https://github.com');
  
      const modifiedRequest = new Request(githubUrl, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: 'follow'
      });
  
      // 关键：使用流式转发，不读取内容，直接 pipe 过去
      const response = await fetch(modifiedRequest);
      
      // 允许跨域，防止某些客户端报错
      const outHeaders = new Headers(response.headers);
      outHeaders.set('Access-Control-Allow-Origin', '*');
  
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders
      });
    }
  };