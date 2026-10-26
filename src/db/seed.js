const bcrypt = require('bcryptjs');

const ROLE_SEEDS = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access to the platform, user accounts, roles and permissions.'
  },
  {
    key: 'farmer',
    name: 'Farmer',
    description: 'Manages their own harvest listings and conversations with buyers.'
  },
  {
    key: 'buyer',
    name: 'Buyer',
    description: 'Discovers harvests, manages requests and connects with farmers.'
  }
];

const PERMISSION_SEEDS = [
  ['platform:view', 'View platform overview', 'Platform', 'See account, farmer, buyer and marketplace totals.'],
  ['users:view', 'View users', 'Users', 'Open the user directory and profile details.'],
  ['users:create', 'Create users', 'Users', 'Add farmer, buyer or administrator accounts.'],
  ['users:update', 'Edit users', 'Users', 'Update names, phone numbers, email addresses and roles.'],
  ['users:status', 'Manage account status', 'Users', 'Enable, disable, lock or unlock accounts.'],
  ['users:delete', 'Delete users', 'Users', 'Permanently remove user accounts.'],
  ['roles:view', 'View roles', 'Access', 'See every role and the permissions attached to it.'],
  ['roles:manage', 'Manage role permissions', 'Access', 'Change what farmer and buyer roles are allowed to do.'],
  ['permissions:view', 'View permissions', 'Access', 'Browse the full permission catalog.'],
  ['harvests:view', 'View harvests', 'Marketplace', 'See harvest listings across the platform.'],
  ['harvests:manage_own', 'Manage own harvests', 'Marketplace', 'Create and maintain personal harvest listings.'],
  ['harvests:moderate', 'Moderate harvests', 'Marketplace', 'Hide or remove listings that break platform rules.'],
  ['requests:create', 'Create buyer requests', 'Marketplace', 'Post a request for a crop.'],
  ['requests:manage_own', 'Manage own requests', 'Marketplace', 'Update or close personal buyer requests.'],
  ['requests:view', 'View buyer requests', 'Marketplace', 'See requests posted by buyers.'],
  ['messages:send', 'Send messages', 'Marketplace', 'Contact farmers or buyers directly.'],
  ['messages:view', 'View message activity', 'Marketplace', 'Review conversations and platform message activity.']
];

const ROLE_PERMISSION_DEFAULTS = {
  farmer: ['harvests:manage_own', 'requests:create', 'messages:send'],
  buyer: ['harvests:view', 'requests:manage_own', 'messages:send']
};

const DEMO_USERS = [
  {
    key: 'ADMIN',
    role: 'super_admin',
    name: 'Umuhinzi Connect Admin',
    phone: '+250788000003',
    email: 'admin@umuhinziconnect.rw',
    password: 'Admin@2026',
    district: 'Kigali',
    sector: 'Nyarugenge'
  },
  {
    key: 'FARMER',
    role: 'farmer',
    name: 'Aline Mukamana',
    phone: '+250788000001',
    email: 'farmer@umuhinziconnect.rw',
    password: 'Farmer@2026',
    district: 'Musanze',
    sector: 'Muhoza'
  },
  {
    key: 'BUYER',
    role: 'buyer',
    name: 'Eric Nshimiyimana',
    phone: '+250788000002',
    email: 'buyer@umuhinziconnect.rw',
    password: 'Buyer@2026',
    district: 'Kigali',
    sector: 'Gasabo'
  }
];

const cleanOptional = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
};

async function seedRoles(client) {
  for (const role of ROLE_SEEDS) {
    await client.query(
      `INSERT INTO roles (key, name, description, is_system)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (key) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             updated_at = NOW()`,
      [role.key, role.name, role.description]
    );
  }
}

async function seedPermissions(client) {
  for (const [key, label, groupName, description] of PERMISSION_SEEDS) {
    await client.query(
      `INSERT INTO permissions (key, label, group_name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
         SET label = EXCLUDED.label,
             group_name = EXCLUDED.group_name,
             description = EXCLUDED.description`,
      [key, label, groupName, description]
    );
  }
}

async function seedRolePermissions(client) {
  const { rows: roles } = await client.query('SELECT id, key FROM roles');
  const { rows: permissions } = await client.query('SELECT id, key FROM permissions');
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  for (const role of roles) {
    if (role.key === 'super_admin') {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.id]
      );
      continue;
    }

    const defaults = ROLE_PERMISSION_DEFAULTS[role.key] || [];
    if (defaults.length === 0) continue;

    const { rows } = await client.query(
      'SELECT 1 FROM role_permissions WHERE role_id = $1 LIMIT 1',
      [role.id]
    );
    if (rows.length > 0) continue;

    const permissionIds = defaults.map((key) => permissionByKey.get(key)).filter(Boolean);
    for (const permissionId of permissionIds) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.id, permissionId]
      );
    }
  }
}

function resolveSeedUser(user) {
  const prefix = `SEED_${user.key}`;
  const isProduction = process.env.NODE_ENV === 'production';
  const password = process.env[`${prefix}_PASSWORD`] || (isProduction ? null : user.password);

  return {
    role: user.role,
    name: String(process.env[`${prefix}_NAME`] || user.name).trim(),
    phone: cleanOptional(process.env[`${prefix}_PHONE`] || user.phone),
    email: cleanOptional(process.env[`${prefix}_EMAIL`] || user.email)?.toLowerCase(),
    password,
    district: cleanOptional(process.env[`${prefix}_DISTRICT`] || user.district),
    sector: cleanOptional(process.env[`${prefix}_SECTOR`] || user.sector)
  };
}

async function seedUsers(client) {
  if (String(process.env.SEED_DEMO_USERS || '').toLowerCase() === 'false') return;

  for (const demoUser of DEMO_USERS) {
    const user = resolveSeedUser(demoUser);
    if (!user.phone || !user.password) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[seed] Skipped ${user.role}: set ${`SEED_${demoUser.key}_PASSWORD`} to create it.`);
      }
      continue;
    }

    const existing = await client.query(
      `SELECT id FROM users
        WHERE phone = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2)
        LIMIT 1`,
      [user.phone, user.email]
    );
    if (existing.rows.length > 0) continue;

    const passwordHash = await bcrypt.hash(user.password, 10);
    await client.query(
      `INSERT INTO users (
         full_name, phone, email, password_hash, role, district, sector,
         enabled, account_non_locked
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)`,
      [
        user.name,
        user.phone,
        user.email,
        passwordHash,
        user.role,
        user.district,
        user.sector
      ]
    );

    console.log(`[seed] Created ${user.role} account: ${user.phone}`);
  }
}

const MARKET_PRICE_SEEDS = [
  {
    crop_name: 'Maize',
    crop_key: 'harvests.crops.maize',
    market: 'Nyabugogo',
    district: 'Kigali',
    unit: 'kg',
    price: 460,
    previous_price: 445,
    change_percent: 3.4,
    series: [430, 438, 442, 435, 448, 452, 460]
  },
  {
    crop_name: 'Beans',
    crop_key: 'harvests.crops.beans',
    market: 'Musanze Central',
    district: 'Musanze',
    unit: 'kg',
    price: 790,
    previous_price: 776,
    change_percent: 1.8,
    series: [760, 768, 775, 770, 780, 786, 790]
  },
  {
    crop_name: 'Irish Potatoes',
    crop_key: 'harvests.crops.potatoes',
    market: 'Musanze Central',
    district: 'Musanze',
    unit: 'kg',
    price: 330,
    previous_price: 337,
    change_percent: -2.1,
    series: [345, 340, 338, 335, 332, 334, 330]
  },
  {
    crop_name: 'Tomatoes',
    crop_key: 'harvests.crops.tomatoes',
    market: 'Nyabugogo',
    district: 'Kigali',
    unit: 'kg',
    price: 620,
    previous_price: 589,
    change_percent: 5.2,
    series: [560, 575, 590, 585, 600, 610, 620]
  },
  {
    crop_name: 'Rice',
    crop_key: 'harvests.crops.rice',
    market: 'Bugarama',
    district: 'Huye',
    unit: 'kg',
    price: 960,
    previous_price: 951,
    change_percent: 0.9,
    series: [940, 945, 950, 955, 952, 958, 960]
  },
  {
    crop_name: 'Cassava',
    crop_key: 'harvests.crops.cassava',
    market: 'Huye Central',
    district: 'Huye',
    unit: 'kg',
    price: 290,
    previous_price: 294,
    change_percent: -1.4,
    series: [300, 298, 295, 294, 292, 291, 290]
  },
  {
    crop_name: 'Onions',
    crop_key: 'harvests.crops.onions',
    market: 'Rubavu Border',
    district: 'Rubavu',
    unit: 'kg',
    price: 540,
    previous_price: 519,
    change_percent: 4.1,
    series: [500, 510, 515, 520, 525, 530, 540]
  },
  {
    crop_name: 'Avocado',
    crop_key: 'harvests.crops.avocado',
    market: 'Nyagatare Central',
    district: 'Nyagatare',
    unit: 'kg',
    price: 870,
    previous_price: 877,
    change_percent: -0.8,
    series: [880, 875, 872, 878, 874, 872, 870]
  },
  {
    crop_name: 'Bananas',
    crop_key: 'harvests.crops.bananas',
    market: 'Rwamagana',
    district: 'Rwamagana',
    unit: 'kg',
    price: 360,
    previous_price: 351,
    change_percent: 2.6,
    series: [340, 345, 350, 348, 352, 355, 360]
  },
  {
    crop_name: 'Oranges',
    crop_key: 'harvests.crops.oranges',
    market: 'Nyamasheke',
    district: 'Nyamasheke',
    unit: 'kg',
    price: 710,
    previous_price: 733,
    change_percent: -3.2,
    series: [740, 735, 730, 725, 720, 715, 710]
  },
  {
    crop_name: 'Cabbage',
    crop_key: 'harvests.crops.cabbage',
    market: 'Rubavu Border',
    district: 'Rubavu',
    unit: 'kg',
    price: 260,
    previous_price: 257,
    change_percent: 1.1,
    series: [250, 252, 255, 254, 258, 259, 260]
  },
  {
    crop_name: 'Carrots',
    crop_key: 'harvests.crops.carrots',
    market: 'Kimironko',
    district: 'Kigali',
    unit: 'kg',
    price: 410,
    previous_price: 408,
    change_percent: 0.4,
    series: [400, 402, 405, 404, 408, 409, 410]
  }
];

async function seedMarketPrices(client) {
  const { rows } = await client.query('SELECT count(*) FROM market_prices');
  if (parseInt(rows[0].count, 10) > 0) return;

  for (const item of MARKET_PRICE_SEEDS) {
    await client.query(
      `INSERT INTO market_prices (
         crop_name, crop_key, market, district, unit, price, previous_price,
         change_percent, series
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        item.crop_name,
        item.crop_key,
        item.market,
        item.district,
        item.unit,
        item.price,
        item.previous_price,
        item.change_percent,
        JSON.stringify(item.series)
      ]
    );
  }
  console.log(`[seed] Inserted ${MARKET_PRICE_SEEDS.length} market prices.`);
}

const PAGE_SEEDS = [
  {
    slug: 'about',
    title: 'About Umuhinzi Connect',
    content: {
      badge: 'Our Mission',
      stamp: 'Est. Rwanda 2024',
      title: 'Connecting Rwandan agriculture directly from soil to market.',
      subtitle: 'We eliminate predatory middlemen so smallholders keep more value and buyers get traceable, fresh produce at fair transparent market rates.',
      stats: [
        { value: '1,240+', label: 'Registered Farmers' },
        { value: '30', label: 'Districts Covered' },
        { value: '18,500+', label: 'Tons Traded' },
        { value: '98.4%', label: 'On-time Deliveries' }
      ],
      values: [
        {
          title: 'Direct Market Access',
          desc: 'Farmers list directly, keeping full transparency over pricing and transactions without intermediaries.'
        },
        {
          title: 'Fair Transparent Prices',
          desc: 'Real-time market indices across all districts eliminate price exploitation and speculation.'
        },
        {
          title: 'Traceability & Trust',
          desc: 'Know the source district, harvest date, and quality standards for every agricultural lot.'
        },
        {
          title: 'Empowering Communities',
          desc: 'Strengthening local farmer cooperatives, reducing food waste, and fostering rural resilience.'
        }
      ]
    },
    meta: {
      description: 'Learn about Umuhinzi Connect — bridging Rwandan farmers with verified wholesale and retail buyers.',
      keywords: ['Rwanda agriculture', 'farmer direct marketplace', 'fair trade produce']
    }
  },
  {
    slug: 'home',
    title: 'Home — Umuhinzi Connect',
    content: {
      headline: 'Rwanda’s Modern Harvest Marketplace',
      tagline: 'Connecting farmers and buyers across all 30 districts with verified fair prices and real-time listings.',
      features: [
        { title: 'Direct Farmer Listings', desc: 'Browse harvests fresh from cooperatives and smallholder farmers.' },
        { title: 'District Market Prices', desc: 'Track daily price trends across Kigali, Musanze, Huye, Rubavu, and more.' },
        { title: 'Verified Profiles', desc: 'Transact with confidence with vetted farmers and registered buyers.' }
      ]
    },
    meta: {
      description: 'Umuhinzi Connect links Rwandan farmers directly to buyers.'
    }
  }
];

async function seedPages(client) {
  for (const p of PAGE_SEEDS) {
    await client.query(
      `INSERT INTO pages (slug, title, content, meta)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             content = EXCLUDED.content,
             meta = EXCLUDED.meta,
             updated_at = NOW()`,
      [p.slug, p.title, JSON.stringify(p.content), JSON.stringify(p.meta)]
    );
  }
  console.log(`[seed] Verified and updated ${PAGE_SEEDS.length} content pages.`);
}

const SAMPLE_HARVESTS = [
  {
    lot: 'UC-01',
    crop_name: 'Maize',
    variety: 'Yellow maize',
    category: 'grains',
    district: 'Nyagatare',
    sector: 'Karangazi',
    quantity_kg: 1200,
    price_per_kg: 450,
    description: 'High quality sun-dried yellow maize suitable for milling and animal feed.',
    image_url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-02',
    crop_name: 'Beans',
    variety: 'Red kidney beans',
    category: 'legumes',
    district: 'Musanze',
    sector: 'Kinigi',
    quantity_kg: 800,
    price_per_kg: 780,
    description: 'Graded volcanic soil red kidney beans, high protein content and well sorted.',
    image_url: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-03',
    crop_name: 'Irish Potatoes',
    variety: 'Kinigi variety',
    category: 'vegetables',
    district: 'Musanze',
    sector: 'Muhoza',
    quantity_kg: 2000,
    price_per_kg: 320,
    description: 'Premier Kinigi Irish potatoes freshly harvested from the foothills of the volcanoes.',
    image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-04',
    crop_name: 'Tomatoes',
    variety: 'Fresh red tomatoes',
    category: 'vegetables',
    district: 'Kigali',
    sector: 'Gasabo',
    quantity_kg: 500,
    price_per_kg: 600,
    description: 'Greenhouse ripe vine tomatoes with exceptional shelf life and firmness.',
    image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-05',
    crop_name: 'Rice',
    variety: 'Paddy rice',
    category: 'grains',
    district: 'Huye',
    sector: 'Bugarama',
    quantity_kg: 1500,
    price_per_kg: 950,
    description: 'Aromatic long-grain paddy rice cultivated in the fertile Bugarama valley wetlands.',
    image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-06',
    crop_name: 'Cassava',
    variety: 'Fresh sweet cassava',
    category: 'vegetables',
    district: 'Huye',
    sector: 'Ngoma',
    quantity_kg: 1000,
    price_per_kg: 280,
    description: 'Farm-fresh sweet cassava tubers ready for processing or direct consumer sale.',
    image_url: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-07',
    crop_name: 'Onions',
    variety: 'Red onions',
    category: 'vegetables',
    district: 'Rubavu',
    sector: 'Gisenyi',
    quantity_kg: 700,
    price_per_kg: 520,
    description: 'Cured red onions with pungent flavor and long storage endurance.',
    image_url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-08',
    crop_name: 'Avocado',
    variety: 'Hass avocado',
    category: 'fruits',
    district: 'Nyagatare',
    sector: 'Nyagatare',
    quantity_kg: 600,
    price_per_kg: 850,
    description: 'Export-grade Hass avocados with high oil content and rich creamy texture.',
    image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-09',
    crop_name: 'Bananas',
    variety: 'Cooking bananas',
    category: 'fruits',
    district: 'Rwamagana',
    sector: 'Muhazi',
    quantity_kg: 2500,
    price_per_kg: 350,
    description: 'Plump matooke cooking green bananas harvested in prime condition.',
    image_url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&auto=format&fit=crop'
  },
  {
    lot: 'UC-10',
    crop_name: 'Carrots',
    variety: 'Fresh Nantes carrots',
    category: 'vegetables',
    district: 'Musanze',
    sector: 'Muhoza',
    quantity_kg: 750,
    price_per_kg: 400,
    description: 'Crunchy sweet orange carrots, washed and graded for wholesale buyers.',
    image_url: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop'
  }
];

async function seedSampleHarvests(client) {
  const { rows: countRows } = await client.query('SELECT count(*) FROM harvests');
  if (parseInt(countRows[0].count, 10) >= 8) return;

  const { rows: farmers } = await client.query(
    "SELECT id FROM users WHERE role = 'farmer' ORDER BY created_at ASC LIMIT 1"
  );
  if (!farmers.length) return;
  const farmerId = farmers[0].id;

  for (const h of SAMPLE_HARVESTS) {
    const existing = await client.query(
      'SELECT id FROM harvests WHERE crop_name = $1 AND district = $2 LIMIT 1',
      [h.crop_name, h.district]
    );
    if (existing.rows.length > 0) continue;

    await client.query(
      `INSERT INTO harvests (
         farmer_id, crop_name, quantity_kg, price_per_kg, harvest_date,
         district, sector, description, image_url, status, category, variety, lot
       )
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, 'active', $9, $10, $11)`,
      [
        farmerId,
        h.crop_name,
        h.quantity_kg,
        h.price_per_kg,
        h.district,
        h.sector,
        h.description,
        h.image_url,
        h.category,
        h.variety,
        h.lot
      ]
    );
  }
  console.log('[seed] Seeded sample active harvests for public discovery.');
}

async function seedDatabase(client) {
  await seedRoles(client);
  await seedPermissions(client);
  await seedRolePermissions(client);
  await seedUsers(client);
  await seedMarketPrices(client);
  await seedPages(client);
  await seedSampleHarvests(client);
}

module.exports = { seedDatabase };

