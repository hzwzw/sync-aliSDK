var util = require('../topUtil.js');
var RestClient = require('./network.js')
var Stream = require('stream')
/**
 * TOP API Client.
 *
 * @param {Object} options, must set `appkey` and `appsecret`.
 * @constructor
 */

function TopClient(options) {
    if (!(this instanceof TopClient)) {
        return new TopClient(options);
    }
    options = options || {};
    if (!options.appkey || !options.appsecret) {
        throw new Error('appkey or appsecret need!');
    }
    this.url = options.url || 'http://gw.api.taobao.com/router/rest';
    this.platform = options.platform || 'aliexpress';
    this.appkey = options.appkey;
    this.appsecret = options.appsecret;
}

/**
 * Invoke an api by method name.
 *
 * @param {String} method, method name
 * @param {Object} params
 * @param {Array} reponseNames, e.g. ['tmall_selected_items_search_response', 'tem_list', 'selected_item']
 * @param {Object} defaultResponse
 * @param {Function(err, response)} callback
 */
TopClient.prototype.invoke = function (type, method, params, reponseNames, callback) {
    params.method = method;
    const cb = (err, result) => {
      if (err) {
        return callback(err);
      }
      var response = result;
      if (reponseNames && reponseNames.length > 0) {
        var retResult = undefined;
        for (var i = 0; i < reponseNames.length; i++) {
          var name = reponseNames[i];
          retResult = response[name];
          if (retResult != undefined) {
            response = retResult;
            break;
          }
        }
      }
      callback(null, response);
    }
    if (this.platform === 'aliexpress') {
       return this.request(type, params, cb);
    }
    if (this.platform === 'lazada') {
       return this.lazadaRequest(type, params, cb);
    }

};

/**
 * Request API.
 *
 * @param {Object} params
 * @param {String} [type='GET']
 * @param {Function(err, result)} callback
 * @public
 */
TopClient.prototype.request = function (type, params, callback) {
    let err;
    const skipAuth = params.skipAuth;
    if (skipAuth) {
      delete params.skipAuth;
    }else {
      err = util.checkRequired(params, ['sessionInfo', 'method']);
      const now = Date.now();
      const thirdExpiredTime = params.sessionInfo.sessionExpireTime - 5000;
      if (now > thirdExpiredTime) {
        err = new Error('店铺授权已过期, 请到速卖通服务市场续费后，回到控制台重新添加授权');
        err.code = 27;
      }
      if (err) {
        return callback(err);
      }
      params.session = params.sessionInfo.session;
      delete params.sessionInfo;
    }

    var args = {
        timestamp: this.timestamp(),
        format: 'json',
        app_key: this.appkey,
        v: '2.0',
        sign_method: 'md5'
    };

    let request = null;
    if (type === 'get'){
        request = RestClient.get(this.url);
    }else{
        request = RestClient.post(this.url);
    }

    for (var key in params) {
        if(typeof params[key] === 'object' && Buffer.isBuffer(params[key])){
            request.attach(key,params[key],{knownLength:params[key].length,filename:key})
        } else if(typeof params[key] === 'object'){
            args[key] = JSON.stringify(params[key]);
        } else{
            args[key] = params[key];
        }
    }

    args.sign = this.sign(args);
    for(var key in args){
        request.field(key, args[key]);
    }

    request.end(function(response){
        if(response.statusCode == 200){
            var data = response.body;
            var errRes = data && data.error_response;
            if (errRes && !errRes.message) {
                //不加这句async.js不会处理error
                errRes.message = errRes.msg || 'xxx';
            }
            if (errRes) {
                callback(errRes, data);
            }else{
                callback(err, data);
            }
        }else{
            err = new Error('NetWork-Error');
            err.name = 'NetWork-Error';
            err.code = 15;
            err.sub_code = response.statusCode;
            callback(err, null);
        }
    })
};

// when request access_token set params.isAuthRequest = true
TopClient.prototype.lazadaRequest = function (type, params, callback) {
  const isAuthRequest = params.isAuthRequest;
  let err = util.checkRequired(params, ['method']);
  if (!isAuthRequest) {
    err = util.checkRequired(params, ['sessionInfo'])
  }
  if (err) {
    return callback(err);
  }
  const now = Date.now();

  if (!isAuthRequest) {
      const thirdExpiredTime = params.sessionInfo.sessionExpireTime - 5000;
      if (now > thirdExpiredTime) {
        err = new Error('店铺授权已过期, 请到速卖通服务市场续费后，回到控制台重新添加授权');
        err.code = 27;
        return callback(err);
      }
      params.access_token = params.sessionInfo.session;
      delete params.sessionInfo;
  }else {
      delete params.isAuthRequest;
  }

  const method = params.method;
  delete params.method;

  let args = {
    timestamp: now,
    app_key: this.appkey,
    sign_method: 'sha256',
  };

  var request = null;
  const url = this.url + method;
  if(type == 'get'){
    request = RestClient.get(url);
  }else{
    request = RestClient.post(url);
  }

  for (var key in params) {
    if(typeof params[key] === 'object' && Buffer.isBuffer(params[key])){
      request.attach(key,params[key],{knownLength:params[key].length,filename:key})
    } else if(typeof params[key] === 'object'){
      args[key] = JSON.stringify(params[key]);
    } else{
      args[key] = params[key];
    }
  }

  args.sign = this.hmac_sign(args, method);
  for(var key in args){
    request.field(key, args[key]);
  }

  request.end(function(response){
    if(response.statusCode == 200){
      var data = response.body;
      var errRes = data && data.error_response;
      if (errRes && !errRes.message) {
        //不加这句async.js不会处理error
        errRes.message = errRes.msg || 'xxx';
      }
      if (errRes) {
        callback(errRes, data);
      }else{
        callback(err, data);
      }
    }else{
      err = new Error('NetWork-Error');
      err.name = 'NetWork-Error';
      err.code = 15;
      err.sub_code = response.statusCode;
      callback(err, null);
    }
  })
};

/**
 * Get now timestamp with 'yyyy-MM-dd HH:mm:ss' format.
 * @return {String}
 */
TopClient.prototype.timestamp = function () {
    return util.YYYYMMDDHHmmss();
};

/**
 * Sign API request.
 * see http://open.taobao.com/doc/detail.htm?id=111#s6
 *
 * @param  {Object} params
 * @return {String} sign string
 */
TopClient.prototype.sign = function (params) {
    var sorted = Object.keys(params).sort();

    let basestring = this.appsecret;
    for (let i = 0, l = sorted.length; i < l; i++) {
      var k = sorted[i];
      basestring += k + params[k];
    }
    basestring += this.appsecret;
    return util.md5(basestring).toUpperCase();
};

TopClient.prototype.hmac_sign = function (params, api_name) {
    var sorted = Object.keys(params).sort();
    let basestring = api_name;
    for (var i = 0, l = sorted.length; i < l; i++) {
      var k = sorted[i];
      basestring += k + params[k];
    }
    return util.hmac_sha256(basestring, this.appsecret).toUpperCase();
};

/**
 * execute top api
 */
TopClient.prototype.execute = function (apiname, params) {
    let that = this;
    return new Promise(function (resolve, reject) {
      that.invoke('post',apiname, params, [util.getApiResponseName(apiname)], (err, response) => {
          if (err) {
              return reject(err);
          }
          resolve(response);
      });
    })
};

exports.TopClient = TopClient;
