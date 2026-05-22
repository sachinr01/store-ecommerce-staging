"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const collectionRows = [
  {
    staticSide: 'left' as const,
    staticPanel: {
      title: 'Dinnerware',
      src: '/store/images/collection/dinner_set_main_bn.jpeg',
      alt: 'Dinnerware Collection',
      href: '/shop/dinner-set',
    },
    slides: [
      {
        title: 'Plates',
        src: '/store/images/collection/Dinner-Set-Plates.png',
        alt: 'Plates Collection',
        href: '/shop/dinner-set',
      },
      {
        title: 'Bowls',
        src: '/store/images/collection/Dinner-Set-Bowls.png',
        alt: 'Bowls Collection',
        href: '/shop/dinner-set',
      },
      {
        title: 'Platters',
        src: '/store/images/collection/Dinner-Set-Platter.png',
        alt: 'Platters Collection',
        href: '/shop/dinner-set',
      },
      {
        title: 'Dinner-Sets',
        src: '/store/images/collection/Dinner-Sets-Dinner-Set.png',
        alt: 'Platters Collection',
        href: '/shop/dinner-set',
      },
    ],
  },

  {
    staticSide: 'right' as const,
    staticPanel: {
      title: 'Drinkware',
      src: '/store/images/collection/drinkware_main_bn.jpeg',
      alt: 'Drinkware Collection',
      href: '/shop/drinkware',
    },
    slides: [
      {
        title: 'Cups & Mugs',
        src: '/store/images/collection/Drinkware-Cups-&-Mugs.png',
        alt: 'Cups & Mugs Collection',
        href: '/shop/drinkware',
      },
      {
        title: 'Whiskey Glass',
        src: '/store/images/collection/Drinkware-Whiskey-Glasses.png',
        alt: 'Whiskey Glass Collection',
        href: '/shop/drinkware',
      },
      {
        title: 'Beer Glass',
        src: '/store/images/collection/Drinkware-Beer-Glasses.png',
        alt: 'Beer Glass collection',
        href: '/shop/drinkware',
      },
      {
        title: 'Stemware',
        src: '/store/images/collection/Drinkware-Stemwares.png',
        alt: 'Stemware collection',
        href: '/shop/drinkware',
      },
      {
        title: 'Tumblers',
        src: '/store/images/collection/Drinkware-Tumblers.png',
        alt: 'Tumblers collection',
        href: '/shop/drinkware',
      },
      {
        title: 'Insulated Mugs',
        src: '/store/images/collection/Drinkware-Insulated-Mugs.png',
        alt: 'Insulated Mugs collection',
        href: '/shop/drinkware',
      },
    ],
  },

  {
    staticSide: 'left' as const,
    staticPanel: {
      title: 'Containers',
      src: '/store/images/collection/containers_main_bn.jpeg',
      alt: 'Containers collection',
      href: '/shop/kitchen-organisers',
    },
    slides: [
      {
        title: 'Containers',
        src: '/store/images/collection/Container-Contaner.png',
        alt: 'Containers collection',
        href: '/shop/kitchen-organisers',
      },
      {
        title: 'Spice Jars',
        src: '/store/images/collection/Container-Spice-Jar.png',
        alt: 'Spice Jars collection',
        href: '/shop/kitchen-organisers',
      },
      {
        title: 'Spice Jars 2',
        src: '/store/images/collection/Container-Spice-Jars2.png',
        alt: 'Spice Jars 2 collection',
        href: '/shop/kitchen-organisers',
      },
    ],
  },
  // {
  //   staticSide: 'right' as const,
  //   staticPanel: {
  //     title: 'Jars and Containers',
  //     src: '/store/images/category_images/CC_GLASSWARE.png',
  //     alt: 'Jars and containers collection',
  //     href: '/shop/jars-and-containers',
  //   },
  //   slides: [
  //     {
  //       title: 'Spice Rack',
  //       src: 'https://www.blackcarrot.in/cdn/shop/files/Black___Carrot__spice__rack.jpg?v=1769698271&width=1200',
  //       alt: 'Spice rack collection',
  //       href: '/shop/jars-and-containers',
  //     },
  //     {
  //       title: 'Storage Jars',
  //       src: 'https://www.blackcarrot.in/cdn/shop/files/BlackCarrot_Container.jpg?v=1769698426&width=1200',
  //       alt: 'Storage jars collection',
  //       href: '/shop/jars-and-containers',
  //     },
  //   ],
  // },
];

type CollectionRow = (typeof collectionRows)[number];
type CollectionPanel = CollectionRow['staticPanel'];
type CollectionSlide = CollectionRow['slides'][number];
type MobilePanel = CollectionPanel | CollectionSlide;

function StaticPanel({ panel, priority }: { panel: CollectionPanel; priority: boolean }) {
  return (
    <Link href={panel.href} className="featured-panel featured-panel-static">
      <Image
        src={panel.src}
        alt={panel.alt}
        width={1120}
        height={620}
        priority={priority}
        sizes="(max-width: 990px) 100vw, 60vw"
      />

    </Link>
  );
}

function SliderRail({ slides, priority }: { slides: CollectionSlide[]; priority: boolean }) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <div className="featured-rail" aria-label="More featured categories">
      <div className="featured-rail-track">
        {slides.map((slide, index) => (
          <Link
            href={slide.href}
            className={`featured-panel featured-panel-rail ${index === activeSlide ? 'active' : ''}`}
            key={slide.title}
            aria-hidden={index === activeSlide ? undefined : true}
            tabIndex={index === activeSlide ? undefined : -1}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              width={760}
              height={620}
              priority={priority && index === 0}
              sizes="(max-width: 990px) 100vw, 40vw"
            />
          </Link>
        ))}
      </div>
      {slides.length > 1 && (
        <span className="featured-panel-dots">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.title}
              className={index === activeSlide ? 'active' : ''}
              aria-label={`Show ${slide.title}`}
              onClick={() => setActiveSlide(index)}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export function FeaturedCollectionPanels() {
  const mobilePanels = collectionRows.flatMap((row) => (
    row.staticSide === 'left'
      ? [row.staticPanel, row.slides[0]]
      : [row.slides[0], row.staticPanel]
  )).filter(Boolean) as MobilePanel[];

  return (
    <section className="featured-collections-section" aria-labelledby="featured-collections-title">
      <h2 className="section-title" id="featured-collections-title">Our Collection</h2>
      <div className="featured-collections">
        {collectionRows.map((row, rowIndex) => (
          <div
            className={`featured-collection-row featured-collection-row-static-${row.staticSide}`}
            key={`${row.staticPanel.title}-${rowIndex}`}
          >
            {row.staticSide === 'left' ? (
              <>
                <StaticPanel panel={row.staticPanel} priority={rowIndex === 0} />
                <SliderRail slides={row.slides} priority={rowIndex === 0} />
              </>
            ) : (
              <>
                <SliderRail slides={row.slides} priority={rowIndex === 0} />
                <StaticPanel panel={row.staticPanel} priority={rowIndex === 0} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="featured-mobile-grid" aria-label="Trending collections">
        {mobilePanels.map((panel, index) => (
          <Link href={panel.href} className="featured-mobile-tile" key={`${panel.title}-${index}`}>
            <Image
              src={panel.src}
              alt={panel.alt}
              width={420}
              height={520}
              sizes="50vw"
            />
            <span className="featured-mobile-shade" aria-hidden="true" />
            <span className="featured-mobile-content">
              <span className="featured-mobile-title">{panel.title}</span>
              <span className="featured-mobile-button">Explore Collection</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// export function PopularCategories() {
//   const popularCategories = [
//     'https://icmedianew.gumlet.io/pub/media//home_banner/images/Best-Seller01-10.03.2026.jpg',
//     'https://icmedianew.gumlet.io/pub/media//home_banner/images/Best-Seller02-10.03.2026.jpg',
//     'https://icmedianew.gumlet.io/pub/media//home_banner/images/Best-Seller03-10.03.2026.jpg',
//     'https://icmedianew.gumlet.io/pub/media//home_banner/images/Best-Seller04-10.03.2026.jpg',
//   ];

//   return (
//     <section className="home-section home-section-no-top">
//       <h2 className="section-title">Popular Categories</h2>
//       <div className="pop-cat-grid">
//         {popularCategories.map((src, i) => (
//           <div key={i} className="pop-cat-item">
//             <Image src={src} alt={`Category ${i + 1}`} width={420} height={280} />
//           </div>
//         ))}
//       </div>
//     </section>
//   );
// }
