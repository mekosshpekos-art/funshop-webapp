# FunShop WebApp — Assets

Папка для изображений и иконок товаров.

## Структура

```
assets/
├── icons/          # SVG иконки категорий
├── products/       # Фото товаров
└── logo.png        # Логотип магазина
```

## Добавление изображений товаров

1. Загрузите фото в эту папку
2. Укажите относительный путь в `app.js` в `STATIC_CATALOG.products[].image_url`

Пример:
```js
{ id: 1, ..., image_url: "assets/products/cuba-cherry.jpg" }
```

## GitHub Pages

При размещении на GitHub Pages все пути должны быть относительными или абсолютными с вашим доменом.
