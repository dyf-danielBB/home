<template>
  <div class="weather" v-if="weatherData.adCode.city && weatherData.weather.weather">
    <span>{{ weatherData.adCode.city }}&nbsp;</span>
    <span>{{ weatherData.weather.weather }}&nbsp;</span>
    <span>{{ weatherData.weather.temperature }}℃</span>
    <span class="sm-hidden">
      &nbsp;{{
        weatherData.weather.winddirection?.endsWith("风")
          ? weatherData.weather.winddirection
          : weatherData.weather.winddirection + "风"
      }}&nbsp;
    </span>
    <span class="sm-hidden">{{ weatherData.weather.windpower }}&nbsp;级</span>
  </div>
  <div class="weather" v-else>
    <span>天气数据获取失败</span>
  </div>
</template>

<script setup>
import { getAdcode, getWeather, getOtherWeather, getIpLocation, getGeoLocationName } from "@/api";
import { Error } from "@icon-park/vue-next";

// 高德开发者 Key
const mainKey = import.meta.env.VITE_WEATHER_KEY;
const fallbackCity = import.meta.env.VITE_WEATHER_CITY || "苏州";
const fallbackLatitude = import.meta.env.VITE_WEATHER_LATITUDE || "31.2990";
const fallbackLongitude = import.meta.env.VITE_WEATHER_LONGITUDE || "120.5853";

// 天气数据
const weatherData = reactive({
  adCode: {
    city: null, // 城市
    adcode: null, // 城市编码
  },
  weather: {
    weather: null, // 天气现象
    temperature: null, // 实时气温
    winddirection: null, // 风向描述
    windpower: null, // 风力级别
  },
});

// 取出天气平均值
const getTemperature = (min, max) => {
  try {
    // 计算平均值并四舍五入
    const average = (Number(min) + Number(max)) / 2;
    return Math.round(average);
  } catch (error) {
    console.error("计算温度出现错误：", error);
    return "NaN";
  }
};

// 将 km/h 风速粗略换算成常见风力等级
const getWindPower = (speed) => {
  const value = Number(speed);
  if (Number.isNaN(value)) return "0";
  if (value < 1) return "0";
  if (value < 6) return "1";
  if (value < 12) return "2";
  if (value < 20) return "3";
  if (value < 29) return "4";
  if (value < 39) return "5";
  if (value < 50) return "6";
  return "7";
};

const weatherTextMap = {
  0: "晴",
  1: "大部晴朗",
  2: "局部多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "中等阵雨",
  82: "强阵雨",
  95: "雷雨",
  96: "雷雨伴冰雹",
  99: "强雷雨伴冰雹",
};

const weatherTextZhMap = {
  "partly cloudy": "局部多云",
  clear: "晴",
  sunny: "晴",
  cloudy: "多云",
  overcast: "阴",
  mist: "薄雾",
  fog: "雾",
  "light rain": "小雨",
  "moderate rain": "中雨",
  "heavy rain": "大雨",
  shower: "阵雨",
  showers: "阵雨",
  thunderstorm: "雷雨",
  snow: "雪",
};

const getBrowserPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 30 * 60 * 1000,
    });
  });

const getWeatherText = (weather) => {
  const value = String(weather || "").trim();
  if (!value) return "未知天气";
  return weatherTextZhMap[value.toLowerCase()] || value;
};

const getWindDirection = (degree) => {
  const value = Number(degree);
  if (Number.isNaN(value)) return "无持续";
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(value / 45) % directions.length];
};

const normalizeCityName = (city) => {
  const value = String(city || "").trim();
  if (!value) return fallbackCity;
  return value.replace(/市$/, "");
};

const getVisitorLocation = async () => {
  try {
    const position = await getBrowserPosition();
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const location = await getGeoLocationName(latitude, longitude);
    return {
      city: normalizeCityName(location.city || location.locality || location.principalSubdivision),
      latitude,
      longitude,
    };
  } catch (error) {
    console.warn("浏览器定位失败，尝试 IP 定位：", error);
  }

  try {
    const location = await getIpLocation();
    if (location.success && location.latitude && location.longitude) {
      const geoName = await getGeoLocationName(location.latitude, location.longitude);
      return {
        city: normalizeCityName(geoName.city || geoName.locality || location.city),
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }
  } catch (error) {
    console.warn("IP 定位失败，使用默认城市：", error);
  }

  return {
    city: fallbackCity,
    latitude: fallbackLatitude,
    longitude: fallbackLongitude,
  };
};

// 获取天气数据
const getWeatherData = async () => {
  try {
    // 获取地理位置信息
    if (!mainKey) {
      console.log("未配置，使用备用天气接口");
      const location = await getVisitorLocation();
      const result = await getOtherWeather(location.latitude, location.longitude);
      console.log(result);
      const current = result.current;
      if (!current) {
        throw "备用天气接口返回异常";
      }
      weatherData.adCode = {
        city: location.city,
      };
      weatherData.weather = {
        weather: weatherTextMap[current.weather_code] || getWeatherText(current.weatherDesc?.[0]?.value),
        temperature: Math.round(current.temperature_2m),
        winddirection: getWindDirection(current.wind_direction_10m),
        windpower: getWindPower(current.wind_speed_10m),
      };
    } else {
      // 获取 Adcode
      const adCode = await getAdcode(mainKey);
      console.log(adCode);
      if (adCode.infocode !== "10000") {
        throw "地区查询失败";
      }
      weatherData.adCode = {
        city: adCode.city,
        adcode: adCode.adcode,
      };
      // 获取天气信息
      const result = await getWeather(mainKey, weatherData.adCode.adcode);
      weatherData.weather = {
        weather: getWeatherText(result.lives[0].weather),
        temperature: result.lives[0].temperature,
        winddirection: result.lives[0].winddirection,
        windpower: result.lives[0].windpower,
      };
    }
  } catch (error) {
    console.error("天气信息获取失败:" + error);
    onError("天气信息获取失败");
  }
};

// 报错信息
const onError = (message) => {
  ElMessage({
    message,
    icon: h(Error, {
      theme: "filled",
      fill: "#efefef",
    }),
  });
  console.error(message);
};

onMounted(() => {
  // 调用获取天气
  getWeatherData();
});
</script>
