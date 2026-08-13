;(function installHaodooLegacyWebViewPolyfills(global) {
  var arrayPrototype = Array.prototype

  if (typeof arrayPrototype.at !== 'function') {
    Object.defineProperty(arrayPrototype, 'at', {
      value: function at(index) {
        var length = Number(this.length) || 0
        var relativeIndex = Math.trunc(Number(index) || 0)
        if (relativeIndex < 0) relativeIndex += length
        if (relativeIndex < 0 || relativeIndex >= length) return undefined
        return this[relativeIndex]
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof arrayPrototype.findLast !== 'function') {
    Object.defineProperty(arrayPrototype, 'findLast', {
      value: function findLast(callback, thisArg) {
        if (this == null) throw new TypeError('Array.prototype.findLast called on null or undefined')
        if (typeof callback !== 'function') throw new TypeError('callback must be a function')
        var object = Object(this)
        var length = Number(object.length) >>> 0
        for (var index = length - 1; index >= 0; index -= 1) {
          var value = object[index]
          if (callback.call(thisArg, value, index, object)) return value
        }
        return undefined
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof arrayPrototype.findLastIndex !== 'function') {
    Object.defineProperty(arrayPrototype, 'findLastIndex', {
      value: function findLastIndex(callback, thisArg) {
        if (this == null) throw new TypeError('Array.prototype.findLastIndex called on null or undefined')
        if (typeof callback !== 'function') throw new TypeError('callback must be a function')
        var object = Object(this)
        var length = Number(object.length) >>> 0
        for (var index = length - 1; index >= 0; index -= 1) {
          if (callback.call(thisArg, object[index], index, object)) return index
        }
        return -1
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function fromEntries(iterable) {
      var result = {}
      Array.from(iterable).forEach(function (entry) {
        result[entry[0]] = entry[1]
      })
      return result
    }
  }

  if (typeof Object.groupBy !== 'function') {
    Object.groupBy = function groupBy(items, callback) {
      if (items == null) throw new TypeError('Object.groupBy requires items')
      if (typeof callback !== 'function') throw new TypeError('Object.groupBy callback must be a function')
      var groups = Object.create(null)
      Array.from(items).forEach(function (item, index) {
        var key = callback(item, index)
        if (groups[key]) groups[key].push(item)
        else groups[key] = [item]
      })
      return groups
    }
  }

  if (typeof Map.groupBy !== 'function') {
    Map.groupBy = function groupBy(items, callback) {
      if (items == null) throw new TypeError('Map.groupBy requires items')
      if (typeof callback !== 'function') throw new TypeError('Map.groupBy callback must be a function')
      var groups = new Map()
      Array.from(items).forEach(function (item, index) {
        var key = callback(item, index)
        var current = groups.get(key)
        if (current) current.push(item)
        else groups.set(key, [item])
      })
      return groups
    }
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      value: function replaceAll(searchValue, replaceValue) {
        if (searchValue instanceof RegExp) {
          if (!searchValue.global) throw new TypeError('replaceAll RegExp must use the global flag')
          return String(this).replace(searchValue, replaceValue)
        }
        return String(this).split(String(searchValue)).join(String(replaceValue))
      },
      writable: true,
      configurable: true,
    })
  }

  global.__haodooLegacyWebViewCompat = {
    version: 1,
    applyTo: function applyTo(target) {
      if (!target || target === global) return
      try {
        if (target.Array && typeof target.Array.prototype.at !== 'function') {
          target.Array.prototype.at = arrayPrototype.at
        }
        if (target.Array && typeof target.Array.prototype.findLast !== 'function') {
          target.Array.prototype.findLast = arrayPrototype.findLast
        }
        if (target.Array && typeof target.Array.prototype.findLastIndex !== 'function') {
          target.Array.prototype.findLastIndex = arrayPrototype.findLastIndex
        }
        if (target.Object && typeof target.Object.groupBy !== 'function') {
          target.Object.groupBy = Object.groupBy
        }
        if (target.Map && typeof target.Map.groupBy !== 'function') {
          target.Map.groupBy = Map.groupBy
        }
      } catch (error) {
        console.warn('Haodoo legacy WebView iframe compatibility failed', error)
      }
    },
  }
})(window)
