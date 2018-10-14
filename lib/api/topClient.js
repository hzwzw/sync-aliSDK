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
TopClient.prototype.invoke = function (type,method, params,reponseNames, callback) {
    params.method = method;
    this.request(type,params,function (err, result) {
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
    });
};

/**
 * Request API.
 *
 * @param {Object} params
 * @param {String} [type='GET']
 * @param {Function(err, result)} callback
 * @public
 */
TopClient.prototype.request = function (type,params,callback) {
    let err = util.checkRequired(params, ['sessionInfo', 'method']);
    const now = Date.now();
    const thirdExpiredTime = params.seessionInfo.sessionExpireTime - 5000;
    if (now > thirdExpiredTime) {
        err = new Error('aengine pre check, auth seesion expired');
        err.code = 27;
    }
    if (err) {
        return callback(err);
    }
    params.session = params.sessionInfo.session;
    delete params.sessionInfo;

    var args = {
        timestamp: this.timestamp(),
        format: 'json',
        app_key: this.appkey,
        v: '2.0',
        sign_method: 'md5'
    };

    var request = null;
    if(type == 'get'){
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
            if (!errRes.message) {
                //不加这句async.js不会处理error
                errRes.message = "xxx"
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
    var basestring = this.appsecret;
    for (var i = 0, l = sorted.length; i < l; i++) {
        var k = sorted[i];
        basestring += k + params[k];
    }
    basestring += this.appsecret;
    return util.md5(basestring).toUpperCase();
};

/**
 * execute top api
 */
TopClient.prototype.execute = function (apiname,params) {
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
