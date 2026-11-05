window.SWEEP_ROUTES = {
 "meta": {
  "generated": 1793667548,
  "chainId": 8453,
  "metarouter": "0x0fEf9e88A7b76BCDBF451780C6774FE32965Ee98",
  "metaquoter": "0x1dDfeC5058180C207F55BB77D95AcDd0d8227868",
  "factoryRegistry": "0x7b2A2c12dC5Ea2a31455952a05031C3E4BB28F3E",
  "usdc": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "notes": "Candidate routes through NEW Aero pools only (CL factory 0x9CB2\u2026, volatile 0x8E6a\u2026, stable 0x7858\u2026). The page re-quotes live via the Metaquoter.",
  "spacings": [
   1,
   10,
   50,
   100,
   150,
   200,
   250
  ],
  "clFactory": "0x9CB220581b91b0C83223012FE69688b92aD07a76",
  "volatileFactory": "0x8E6a9FCd1d638CC760Ffba397605Fe3355dE76D2",
  "stableFactory": "0x78589E876edcEbdce72ee3436ab3c9AD3a7cEF2D",
  "weth": "0x4200000000000000000000000000000000000006",
  "cbbtc": "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"
 },
 "tokens": {
  "AERO": {
   "address": "0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee",
   "decimals": 18,
   "ref_amount": 50,
   "routes": [
    {
     "pools": [
      "0xc85d5cb72d1aad6f152a8decad228ae4a59ac9b3",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL50",
     "quote_ref_usdc": 30.087221
    },
    {
     "pools": [
      "0xc85d5cb72d1aad6f152a8decad228ae4a59ac9b3",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL100",
     "quote_ref_usdc": 30.0788
    },
    {
     "pools": [
      "0x422df9aa896e883c9cdcbad309c0785b7364a1cf"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL100",
     "quote_ref_usdc": 30.072939
    },
    {
     "pools": [
      "0xe6a7317df4a9a7540663b99a07d1e019caa8afa4",
      "0x42609aa1e58c5dd7e5a012dc74118fff975f0eac"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192cbBTC\u2192CL50",
     "quote_ref_usdc": 30.069885
    },
    {
     "pools": [
      "0xe6a7317df4a9a7540663b99a07d1e019caa8afa4",
      "0x784e539f15ca2d19449a6311c5dab6cf37d8f1ba"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192cbBTC\u2192CL100",
     "quote_ref_usdc": 30.06903
    },
    {
     "pools": [
      "0xf634058dc94e6bf8e828e27621320c423bc8b18e"
     ],
     "kinds": [
      "v2"
     ],
     "via": "vAMM",
     "quote_ref_usdc": 30.057278
    }
   ]
  },
  "WETH": {
   "address": "0x4200000000000000000000000000000000000006",
   "decimals": 18,
   "ref_amount": 0.004,
   "routes": [
    {
     "pools": [
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL50",
     "quote_ref_usdc": 9.015304
    },
    {
     "pools": [
      "0xec3c3755b9ded4a2960ef50c9b48c1694ce274c2",
      "0x42609aa1e58c5dd7e5a012dc74118fff975f0eac"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL1\u2192cbBTC\u2192CL50",
     "quote_ref_usdc": 9.013579
    },
    {
     "pools": [
      "0xec3c3755b9ded4a2960ef50c9b48c1694ce274c2",
      "0x784e539f15ca2d19449a6311c5dab6cf37d8f1ba"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL1\u2192cbBTC\u2192CL100",
     "quote_ref_usdc": 9.013554
    },
    {
     "pools": [
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL100",
     "quote_ref_usdc": 9.012781
    },
    {
     "pools": [
      "0xbb5507daae822ba89c4da61bbfdf4b49a1666bac",
      "0x42609aa1e58c5dd7e5a012dc74118fff975f0eac"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL10\u2192cbBTC\u2192CL50",
     "quote_ref_usdc": 9.006655
    },
    {
     "pools": [
      "0xbb5507daae822ba89c4da61bbfdf4b49a1666bac",
      "0x784e539f15ca2d19449a6311c5dab6cf37d8f1ba"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL10\u2192cbBTC\u2192CL100",
     "quote_ref_usdc": 9.006627
    }
   ]
  },
  "cbBTC": {
   "address": "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
   "decimals": 8,
   "ref_amount": 0.0001,
   "routes": [
    {
     "pools": [
      "0x42609aa1e58c5dd7e5a012dc74118fff975f0eac"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL50",
     "quote_ref_usdc": 7.692511
    },
    {
     "pools": [
      "0x784e539f15ca2d19449a6311c5dab6cf37d8f1ba"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL100",
     "quote_ref_usdc": 7.692151
    },
    {
     "pools": [
      "0xec3c3755b9ded4a2960ef50c9b48c1694ce274c2",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL1\u2192WETH\u2192CL50",
     "quote_ref_usdc": 7.691703
    },
    {
     "pools": [
      "0xbb5507daae822ba89c4da61bbfdf4b49a1666bac",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL10\u2192WETH\u2192CL50",
     "quote_ref_usdc": 7.690122
    },
    {
     "pools": [
      "0xec3c3755b9ded4a2960ef50c9b48c1694ce274c2",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL1\u2192WETH\u2192CL100",
     "quote_ref_usdc": 7.68955
    },
    {
     "pools": [
      "0xbb5507daae822ba89c4da61bbfdf4b49a1666bac",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL10\u2192WETH\u2192CL100",
     "quote_ref_usdc": 7.68797
    }
   ]
  },
  "USDT": {
   "address": "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
   "decimals": 6,
   "ref_amount": 1,
   "routes": [
    {
     "pools": [
      "0xd448990883e3bf9cdd8ebca368a3ecf9d629aaf7"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL1",
     "quote_ref_usdc": 0.998622
    },
    {
     "pools": [
      "0x2dbe0e264c7c246e05c6614794899937f264cf7b",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL50",
     "quote_ref_usdc": 0.998003
    },
    {
     "pools": [
      "0x2dbe0e264c7c246e05c6614794899937f264cf7b",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL100",
     "quote_ref_usdc": 0.997724
    },
    {
     "pools": [
      "0xeedf018b75aa4a2f2ce15c9102b521de974719d0",
      "0x800eb395b577b234c5065c8e0ccb0f3a1401b2c2"
     ],
     "kinds": [
      "v2",
      "v2"
     ],
     "via": "vAMM\u2192WETH\u2192vAMM",
     "quote_ref_usdc": 0.521596
    }
   ]
  },
  "DRV": {
   "address": "0x9d0e8f5b25384c7310cb8c6ae32c8fbeb645d083",
   "decimals": 18,
   "ref_amount": 6,
   "routes": [
    {
     "pools": [
      "0xf0b593cc024bd446d11c24570b4866a704c138be"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL200",
     "quote_ref_usdc": 1.808832
    },
    {
     "pools": [
      "0x2e8b5774887b71e4f806b6d4d9e6eb26cc4d17da",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL50",
     "quote_ref_usdc": 1.806542
    },
    {
     "pools": [
      "0x2e8b5774887b71e4f806b6d4d9e6eb26cc4d17da",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL100",
     "quote_ref_usdc": 1.806036
    },
    {
     "pools": [
      "0x002ae5ae3653a1e46387542c0f68c2dc2a687036",
      "0x800eb395b577b234c5065c8e0ccb0f3a1401b2c2"
     ],
     "kinds": [
      "v2",
      "v2"
     ],
     "via": "vAMM\u2192WETH\u2192vAMM",
     "quote_ref_usdc": 1.798168
    }
   ]
  },
  "XDP": {
   "address": "0x07b3d902783c3c12b077508c3b5c00113d1291d0",
   "decimals": 18,
   "ref_amount": 46,
   "routes": [
    {
     "pools": [
      "0xc3cbfbaab532a04e36b6f901d725eaa5113fd781"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL200",
     "quote_ref_usdc": 0.809789
    }
   ]
  },
  "MORPHO": {
   "address": "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842",
   "decimals": 18,
   "ref_amount": 0.25,
   "routes": [
    {
     "pools": [
      "0x3626a7c07cf4a7edef2ec5d5d4b25bc8ab2c03f2",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL50",
     "quote_ref_usdc": 0.539035
    },
    {
     "pools": [
      "0x3626a7c07cf4a7edef2ec5d5d4b25bc8ab2c03f2",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL100",
     "quote_ref_usdc": 0.538881
    },
    {
     "pools": [
      "0x17e81a9f161109ac3c304c6283df17deba02f896"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL200",
     "quote_ref_usdc": 0.53734
    }
   ]
  },
  "TIBBIR": {
   "address": "0xa4a2e2ca3fbfe21aed83471d28b6f65a233c6e00",
   "decimals": 18,
   "ref_amount": 10,
   "routes": [
    {
     "pools": [
      "0x361fe0318ac98f15720021cb8924b727c3e57d6f",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL50",
     "quote_ref_usdc": 1.93253
    },
    {
     "pools": [
      "0x361fe0318ac98f15720021cb8924b727c3e57d6f",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL100",
     "quote_ref_usdc": 1.931604
    },
    {
     "pools": [
      "0x98f58bbc8d996b8b84f36fd250eb87943209ca47"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL200",
     "quote_ref_usdc": 0.183654
    }
   ]
  },
  "BLUECHIP": {
   "address": "0xb200000000000000000000cfbdf64a8706a94a01",
   "decimals": 18,
   "ref_amount": 400,
   "routes": [
    {
     "pools": [
      "0xbc461ef5225f1bbd2001eead75f56335aa781a69"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL200",
     "quote_ref_usdc": 1.468566
    }
   ]
  },
  "ZEN": {
   "address": "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",
   "decimals": 18,
   "ref_amount": 0.04,
   "routes": [
    {
     "pools": [
      "0x5ca1da1ed90a6cf15974c0a0d2808bfde76314c1",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL50",
     "quote_ref_usdc": 0.202676
    },
    {
     "pools": [
      "0x5ca1da1ed90a6cf15974c0a0d2808bfde76314c1",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL100",
     "quote_ref_usdc": 0.202567
    },
    {
     "pools": [
      "0x8ff6507b35733ee6c62f451676b1638acd42ced1",
      "0x42609aa1e58c5dd7e5a012dc74118fff975f0eac"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192cbBTC\u2192CL50",
     "quote_ref_usdc": 0.201737
    },
    {
     "pools": [
      "0x8ff6507b35733ee6c62f451676b1638acd42ced1",
      "0x784e539f15ca2d19449a6311c5dab6cf37d8f1ba"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192cbBTC\u2192CL100",
     "quote_ref_usdc": 0.20166
    }
   ]
  },
  "VVV": {
   "address": "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf",
   "decimals": 18,
   "ref_amount": 0.05,
   "routes": [
    {
     "pools": [
      "0xc5de7f0514e7531dea5d71a30597c4cf131f533a"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL50",
     "quote_ref_usdc": 1.079682
    },
    {
     "pools": [
      "0xdebaebe5b2729f7d62072b2ea40472d78d2c1626",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL50",
     "quote_ref_usdc": 1.077755
    },
    {
     "pools": [
      "0xdebaebe5b2729f7d62072b2ea40472d78d2c1626",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL100\u2192WETH\u2192CL100",
     "quote_ref_usdc": 1.077174
    },
    {
     "pools": [
      "0xcfc7dc24e9d302976f0b1efb90a4d9b22b54b2a5",
      "0x800eb395b577b234c5065c8e0ccb0f3a1401b2c2"
     ],
     "kinds": [
      "v2",
      "v2"
     ],
     "via": "vAMM\u2192WETH\u2192vAMM",
     "quote_ref_usdc": 1.073005
    },
    {
     "pools": [
      "0x9f11c9e86ef74dd8bc6b3eefa9ff20a96b7f3ffe",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL50",
     "quote_ref_usdc": 1.068177
    },
    {
     "pools": [
      "0x9f11c9e86ef74dd8bc6b3eefa9ff20a96b7f3ffe",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL200\u2192WETH\u2192CL100",
     "quote_ref_usdc": 1.067601
    }
   ]
  },
  "SPCXc": {
   "address": "0xb2000000000000000000007b9fcbd005511acbd5",
   "decimals": 8,
   "ref_amount": 0.001,
   "routes": [
    {
     "pools": [
      "0x880db7dda4407d99508574e680d067d1164b3cfe"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL10",
     "quote_ref_usdc": 0.137256
    },
    {
     "pools": [
      "0xeb0c9976604b3a0724f2818ca1f443558fc551ac",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL50\u2192WETH\u2192CL50",
     "quote_ref_usdc": 0.137018
    },
    {
     "pools": [
      "0xeb0c9976604b3a0724f2818ca1f443558fc551ac",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL50\u2192WETH\u2192CL100",
     "quote_ref_usdc": 0.136944
    }
   ]
  },
  "msUSD": {
   "address": "0x526728dbc96689597f85ae4cd716d4f7fccbae9d",
   "decimals": 18,
   "ref_amount": 5,
   "routes": [
    {
     "pools": [
      "0xbac7394c3c4b2d188d4180275ef6dd629f4c56ff"
     ],
     "kinds": [
      "cl"
     ],
     "via": "CL50",
     "quote_ref_usdc": 4.268023
    },
    {
     "pools": [
      "0xdd2a5dac93e62c27fe0a3236d22fcea29e19c62c"
     ],
     "kinds": [
      "v2"
     ],
     "via": "sAMM",
     "quote_ref_usdc": 4.264432
    }
   ]
  },
  "msETH": {
   "address": "0x7ba6f01772924a82d9626c126347a28299e98c98",
   "decimals": 18,
   "ref_amount": 0.002,
   "routes": [
    {
     "pools": [
      "0x34b6d0c67db6ddeb231e6fee78558b89157c5e7a",
      "0x4a7af46bc8abc00048c6c7920a1488daf568366c"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL50\u2192WETH\u2192CL50",
     "quote_ref_usdc": 3.962063
    },
    {
     "pools": [
      "0x34b6d0c67db6ddeb231e6fee78558b89157c5e7a",
      "0x2a430bebd2082d8e05d56d64dede8944279bbc24"
     ],
     "kinds": [
      "cl",
      "cl"
     ],
     "via": "CL50\u2192WETH\u2192CL100",
     "quote_ref_usdc": 3.959758
    },
    {
     "pools": [
      "0x45adce4be5f602273c6e883a4c94133309af1d09",
      "0x800eb395b577b234c5065c8e0ccb0f3a1401b2c2"
     ],
     "kinds": [
      "v2",
      "v2"
     ],
     "via": "sAMM\u2192WETH\u2192vAMM",
     "quote_ref_usdc": 3.945175
    }
   ]
  }
 },
 "universe": {
  "0x001aad84c21a5cd4d696c56d44866e9703c43f77": {
   "symbol": "CP",
   "decimals": 18
  },
  "0x00f3c42833c3170159af4e92dbb451fb3f708917": {
   "symbol": "ICP",
   "decimals": 8
  },
  "0x04c0599ae5a44757c0af6f9ec3b93da8976c150a": {
   "symbol": "weETH",
   "decimals": 18
  },
  "0x0555e30da8f98308edb960aa94c0db47230d2b9c": {
   "symbol": "WBTC",
   "decimals": 8
  },
  "0x07b3d902783c3c12b077508c3b5c00113d1291d0": {
   "symbol": "XDP",
   "decimals": 18
  },
  "0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef": {
   "symbol": "USDai",
   "decimals": 18
  },
  "0x0a4c9cb2778ab3302996a34befcf9a8bc288c33b": {
   "symbol": "XSGD",
   "decimals": 6
  },
  "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": {
   "symbol": "VIRTUAL",
   "decimals": 18
  },
  "0x0c03ce270b4826ec62e7dd007f0b716068639f7b": {
   "symbol": "TIG",
   "decimals": 18
  },
  "0x0c1c1c109fe34733fca54b82d7b46b75cfb71f6e": {
   "symbol": "CHIP",
   "decimals": 18
  },
  "0x11030f79109269d796fd0fb956d6244e502757f7": {
   "symbol": "CTR",
   "decimals": 18
  },
  "0x1111111111166b7fe7bd91427724b487980afc69": {
   "symbol": "ZORA",
   "decimals": 18
  },
  "0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d": {
   "symbol": "HYPE",
   "decimals": 18
  },
  "0x182fa643e5f29d5eca75e7b9cf9336a3fe4620b2": {
   "symbol": "O",
   "decimals": 18
  },
  "0x18bc5bcc660cf2b9ce3cd51a404afe1a0cbd3c22": {
   "symbol": "IDRX",
   "decimals": 2
  },
  "0x1bc0c42215582d5a085795f4badbac3ff36d1bcb": {
   "symbol": "CLANKER",
   "decimals": 18
  },
  "0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2": {
   "symbol": "BIO",
   "decimals": 18
  },
  "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b": {
   "symbol": "BNKR",
   "decimals": 18
  },
  "0x236aa50979d5f3de3bd1eeb40e81137f22ab794b": {
   "symbol": "tBTC",
   "decimals": 18
  },
  "0x252d36f435582ecb01686448d21e8c9ea0b2ca65": {
   "symbol": "BD",
   "decimals": 18
  },
  "0x27f6c8289550fce67f6b50bed1f519966afe5287": {
   "symbol": "tGBP",
   "decimals": 18
  },
  "0x29cc30f9d113b356ce408667aa6433589cecbdca": {
   "symbol": "ELSA",
   "decimals": 18
  },
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": {
   "symbol": "cbETH",
   "decimals": 18
  },
  "0x311935cd80b76769bf2ecc9d8ab7635b2139cf82": {
   "symbol": "SOL",
   "decimals": 9
  },
  "0x31c2c14134e6e3b7ef9478297f199331133fc2d8": {
   "symbol": "wtSPYM",
   "decimals": 18
  },
  "0x368181499736d0c0cc614dbb145e2ec1ac86b8c6": {
   "symbol": "LUSD",
   "decimals": 18
  },
  "0x3722264ab15a1dfce5a5af89e6547f7949a8aba3": {
   "symbol": "LFI",
   "decimals": 18
  },
  "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2": {
   "symbol": "DRB",
   "decimals": 18
  },
  "0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee": {
   "symbol": "AERO",
   "decimals": 18
  },
  "0x4200000000000000000000000000000000000006": {
   "symbol": "WETH",
   "decimals": 18
  },
  "0x4621b7a9c75199271f773ebd9a499dbd165c3191": {
   "symbol": "DOLA",
   "decimals": 18
  },
  "0x4933a85b5b5466fbaf179f72d3de273c287ec2c2": {
   "symbol": "EURAU",
   "decimals": 6
  },
  "0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8": {
   "symbol": "LCAP",
   "decimals": 18
  },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": {
   "symbol": "DAI",
   "decimals": 18
  },
  "0x526728dbc96689597f85ae4cd716d4f7fccbae9d": {
   "symbol": "msUSD",
   "decimals": 18
  },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": {
   "symbol": "BRETT",
   "decimals": 18
  },
  "0x53f39e5c53ee40bbc3da97c3b47bd2968d110a8d": {
   "symbol": "ALIGN",
   "decimals": 18
  },
  "0x5576d6ed9181f2225aff5282ac0ed29f755437ea": {
   "symbol": "SERV",
   "decimals": 18
  },
  "0x58538e6a46e07434d7e7375bc268d3cb839c0133": {
   "symbol": "ENA",
   "decimals": 18
  },
  "0x5ab000ff9b9ffe0349ce5ffa5fd86f217c3680f5": {
   "symbol": "STONKEX",
   "decimals": 18
  },
  "0x5ab3d4c385b400f3abb49e80de2faf6a88a7b691": {
   "symbol": "FLOCK",
   "decimals": 18
  },
  "0x5b2193fdc451c1f847be09ca9d13a4bf60f8c86b": {
   "symbol": "UP",
   "decimals": 18
  },
  "0x5cda0e1ca4ce2af96315f7f8963c85399c172204": {
   "symbol": "wtCOIN",
   "decimals": 18
  },
  "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": {
   "symbol": "USDe",
   "decimals": 18
  },
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": {
   "symbol": "EURC",
   "decimals": 6
  },
  "0x63706e401c06ac8513145b7687a14804d17f814b": {
   "symbol": "AAVE",
   "decimals": 18
  },
  "0x660975730059246a68521a3e2fbd4740173100f5": {
   "symbol": "syrupUSDC",
   "decimals": 6
  },
  "0x688aee022aa544f150678b8e5720b6b96a9e9a2f": {
   "symbol": "SYRUP",
   "decimals": 18
  },
  "0x696f9436b67233384889472cd7cd58a6fb5df4f1": {
   "symbol": "AVNT",
   "decimals": 18
  },
  "0x6985884c4392d348587b19cb9eaaf157f13271cd": {
   "symbol": "ZRO",
   "decimals": 18
  },
  "0x6b2504a03ca4d43d0d73776f6ad46dab2f2a4cfd": {
   "symbol": "REI",
   "decimals": 18
  },
  "0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee": {
   "symbol": "GHO",
   "decimals": 18
  },
  "0x6c240dda6b5c336df09a4d011139beaaa1ea2aa2": {
   "symbol": "ETHFI",
   "decimals": 18
  },
  "0x7300b37dfdfab110d83290a29dfb31b1740219fe": {
   "symbol": "MAMO",
   "decimals": 18
  },
  "0x74ccbe53f77b08632ce0cb91d3a545bf6b8e0979": {
   "symbol": "fBOMB",
   "decimals": 18
  },
  "0x78c31580c97101694c70022c83d570150c11e935": {
   "symbol": "wtSGOV",
   "decimals": 18
  },
  "0x7ba6f01772924a82d9626c126347a28299e98c98": {
   "symbol": "msETH",
   "decimals": 18
  },
  "0x820c137fa70c8691f0e44dc420a5e53c168921dc": {
   "symbol": "USDS",
   "decimals": 18
  },
  "0x877014e21c32fea108b6a1f45f367efc9a2d9b9f": {
   "symbol": "alUSDb",
   "decimals": 18
  },
  "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": {
   "symbol": "LINK",
   "decimals": 18
  },
  "0x8b7dde054be9d180c1be7fae0874697374a49832": {
   "symbol": "PROS",
   "decimals": 18
  },
  "0x9126236476efba9ad8ab77855c60eb5bf37586eb": {
   "symbol": "CHECK",
   "decimals": 18
  },
  "0x940a319b75861014a220d9c6c144d108552b089b": {
   "symbol": "DEUS",
   "decimals": 18
  },
  "0x97be14dd8f994a5364573bc035d85309e7cb34de": {
   "symbol": "JitoSOL",
   "decimals": 9
  },
  "0x989cfdc3508500d0c91f22896a0d2ee1ef675870": {
   "symbol": "TRX",
   "decimals": 6
  },
  "0x9b5e262cf9bb04869ab40b19af91d2dc85761722": {
   "symbol": "NOCK",
   "decimals": 16
  },
  "0x9c5c365e764829876243d0b289733b9d2b729685": {
   "symbol": "deSPXA",
   "decimals": 18
  },
  "0x9d0e8f5b25384c7310cb8c6ae32c8fbeb645d083": {
   "symbol": "DRV",
   "decimals": 18
  },
  "0x9eadbe35f3ee3bf3e28180070c429298a1b02f93": {
   "symbol": "LMTS",
   "decimals": 18
  },
  "0x9eaf8c1e34f05a589eda6bafdf391cf6ad3cb239": {
   "symbol": "YFI",
   "decimals": 18
  },
  "0xa1832f7f4e534ae557f9b5ab76de54b1873e498b": {
   "symbol": "BID",
   "decimals": 18
  },
  "0xa4a2e2ca3fbfe21aed83471d28b6f65a233c6e00": {
   "symbol": "TIBBIR",
   "decimals": 18
  },
  "0xa749de6c28262b7ffbc5de27dc845dd7ecd2b358": {
   "symbol": "VFY",
   "decimals": 18
  },
  "0xa88594d404727625a9437c3f886c7643872296ae": {
   "symbol": "WELL",
   "decimals": 18
  },
  "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e": {
   "symbol": "PENDLE",
   "decimals": 18
  },
  "0xaaa0008c8cf3a7dca931adaf04336a5d808c82cc": {
   "symbol": "deJAAA",
   "decimals": 18
  },
  "0xaaa843fb2916c0b57454270418e121c626402aaa": {
   "symbol": "AAA",
   "decimals": 18
  },
  "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf": {
   "symbol": "VVV",
   "decimals": 18
  },
  "0xb095274743941e953c746f9c228da9c18bb6ec29": {
   "symbol": "LAPTOP",
   "decimals": 18
  },
  "0xb20000000000000000000006f910a0e7bbd3c168": {
   "symbol": "APPc",
   "decimals": 8
  },
  "0xb2000000000000000000000bd75bf439a38bf7df": {
   "symbol": "DISc",
   "decimals": 8
  },
  "0xb2000000000000000000000d8ce462e99ee7a47b": {
   "symbol": "AMDc",
   "decimals": 8
  },
  "0xb20000000000000000000016f9dfe862feba122b": {
   "symbol": "BEc",
   "decimals": 8
  },
  "0xb20000000000000000000017bb66e9301e913a99": {
   "symbol": "SANc",
   "decimals": 8
  },
  "0xb200000000000000000000187f7071d6e321a7d2": {
   "symbol": "SKHYc",
   "decimals": 8
  },
  "0xb20000000000000000000018fe7ec7d6dfeeb528": {
   "symbol": "PFEc",
   "decimals": 8
  },
  "0xb2000000000000000000001e800a7f5189430cd0": {
   "symbol": "TSLAc",
   "decimals": 8
  },
  "0xb2000000000000000000002137743d4a01fe4e88": {
   "symbol": "SOUNc",
   "decimals": 8
  },
  "0xb20000000000000000000024170488e788cbbcb4": {
   "symbol": "BRK.Bc",
   "decimals": 8
  },
  "0xb2000000000000000000002601c5c94f435da168": {
   "symbol": "HTZc",
   "decimals": 8
  },
  "0xb20000000000000000000026215d755356e5043f": {
   "symbol": "ARMc",
   "decimals": 8
  },
  "0xb2000000000000000000002d0ba3164cc74f58b7": {
   "symbol": "GOOGLc",
   "decimals": 8
  },
  "0xb2000000000000000000002d2b5dc53c61f1ba06": {
   "symbol": "NIOc",
   "decimals": 8
  },
  "0xb2000000000000000000003088798f6d0722aaac": {
   "symbol": "SEc",
   "decimals": 8
  },
  "0xb200000000000000000000347afba223d7b6b63c": {
   "symbol": "ORCLc",
   "decimals": 8
  },
  "0xb200000000000000000000349ef3aa93a0897476": {
   "symbol": "ULc",
   "decimals": 8
  },
  "0xb200000000000000000000397293cb8cda9a10c5": {
   "symbol": "SNDKc",
   "decimals": 8
  },
  "0xb200000000000000000000428e3a3eebbb20692b": {
   "symbol": "DJTc",
   "decimals": 8
  },
  "0xb20000000000000000000043a599976181bcf336": {
   "symbol": "HIMSc",
   "decimals": 8
  },
  "0xb20000000000000000000044e3cd7a0e1028e57a": {
   "symbol": "WENc",
   "decimals": 8
  },
  "0xb200000000000000000000450ad3abe5d4846c6e": {
   "symbol": "PYPLc",
   "decimals": 8
  },
  "0xb200000000000000000000451d033a5000cb479e": {
   "symbol": "cbHYPE",
   "decimals": 18
  },
  "0xb2000000000000000000004884b426556b92883d": {
   "symbol": "MSTRc",
   "decimals": 8
  },
  "0xb2000000000000000000004aff16039ba04bdfbc": {
   "symbol": "INTCc",
   "decimals": 8
  },
  "0xb2000000000000000000004c27f6523082f41d01": {
   "symbol": "Basecat",
   "decimals": 18
  },
  "0xb20000000000000000000058b8c947e44011dfe6": {
   "symbol": "NFLXc",
   "decimals": 8
  },
  "0xb2000000000000000000005ac674f707e357409c": {
   "symbol": "NOKc",
   "decimals": 8
  },
  "0xb2000000000000000000005bd7ae89b9e6189bb5": {
   "symbol": "RBLXc",
   "decimals": 8
  },
  "0xb20000000000000000000063376b142c0764b489": {
   "symbol": "VALEc",
   "decimals": 8
  },
  "0xb20000000000000000000066242d4067724cb7a1": {
   "symbol": "RDDTc",
   "decimals": 8
  },
  "0xb200000000000000000000720133eedf525f93e2": {
   "symbol": "CBRSc",
   "decimals": 8
  },
  "0xb2000000000000000000007790ed6e48e06ed935": {
   "symbol": "GMEc",
   "decimals": 8
  },
  "0xb20000000000000000000078ee7ce2fe4908108c": {
   "symbol": "NVDAc",
   "decimals": 8
  },
  "0xb2000000000000000000007b9fcbd005511acbd5": {
   "symbol": "SPCXc",
   "decimals": 8
  },
  "0xb2000000000000000000007d16372840df4dabbe": {
   "symbol": "PLTRc",
   "decimals": 8
  },
  "0xb20000000000000000000082cd2c7801305808df": {
   "symbol": "NOWc",
   "decimals": 8
  },
  "0xb2000000000000000000008501b13360000cb2ec": {
   "symbol": "cbZEC",
   "decimals": 8
  },
  "0xb2000000000000000000008a7508619c717a7106": {
   "symbol": "WMTc",
   "decimals": 8
  },
  "0xb2000000000000000000008bc8786b856e61707c": {
   "symbol": "METAc",
   "decimals": 8
  },
  "0xb2000000000000000000008d5328e9208773dc58": {
   "symbol": "NVOc",
   "decimals": 8
  },
  "0xb2000000000000000000008fc2a8c23cf5937b66": {
   "symbol": "PMc",
   "decimals": 8
  },
  "0xb2000000000000000000008fde21a1f5c69fec0b": {
   "symbol": "WDCc",
   "decimals": 8
  },
  "0xb2000000000000000000009272a491812842aa84": {
   "symbol": "PTONc",
   "decimals": 8
  },
  "0xb2000000000000000000009b870441031d4d8a41": {
   "symbol": "DKNGc",
   "decimals": 8
  },
  "0xb200000000000000000000a26326a922ffa87f6c": {
   "symbol": "SONYc",
   "decimals": 8
  },
  "0xb200000000000000000000a613d12deafbbb1db7": {
   "symbol": "DUOLc",
   "decimals": 8
  },
  "0xb200000000000000000000ab99cfa739e253872b": {
   "symbol": "MSFTc",
   "decimals": 8
  },
  "0xb200000000000000000000b1a29cf17a1819288a": {
   "symbol": "ASTSc",
   "decimals": 8
  },
  "0xb200000000000000000000c2e324d24d7eecd1fb": {
   "symbol": "AAPLc",
   "decimals": 8
  },
  "0xb200000000000000000000c36ce081dd09e86ca2": {
   "symbol": "BUDc",
   "decimals": 8
  },
  "0xb200000000000000000000c597c476fcf9aed3a8": {
   "symbol": "NVAXc",
   "decimals": 8
  },
  "0xb200000000000000000000c8a7223510467d8563": {
   "symbol": "PDDc",
   "decimals": 8
  },
  "0xb200000000000000000000ca425ab42e07c35bc3": {
   "symbol": "QUBTc",
   "decimals": 8
  },
  "0xb200000000000000000000ca7c6d1438e7245eb6": {
   "symbol": "BILIc",
   "decimals": 8
  },
  "0xb200000000000000000000cae20cb1446462e24c": {
   "symbol": "UBERc",
   "decimals": 8
  },
  "0xb200000000000000000000cfbdf64a8706a94a01": {
   "symbol": "BLUECHIP",
   "decimals": 18
  },
  "0xb200000000000000000000d2b7d9aee52f6c6bef": {
   "symbol": "BIDUc",
   "decimals": 8
  },
  "0xb200000000000000000000d2f4cf2f7debb244bb": {
   "symbol": "MCDc",
   "decimals": 8
  },
  "0xb200000000000000000000d61efd9f54a23ef9eb": {
   "symbol": "LIc",
   "decimals": 8
  },
  "0xb200000000000000000000d9192b6b456483c2e8": {
   "symbol": "AMZNc",
   "decimals": 8
  },
  "0xb200000000000000000000da6f64c306234127e0": {
   "symbol": "SAPc",
   "decimals": 8
  },
  "0xb200000000000000000000e215e9b76ecba02468": {
   "symbol": "MRNAc",
   "decimals": 8
  },
  "0xb200000000000000000000e88efe88d8ade3f0da": {
   "symbol": "WRDc",
   "decimals": 8
  },
  "0xb200000000000000000000e8e50cbbb9a3861a3c": {
   "symbol": "RKLBc",
   "decimals": 8
  },
  "0xb200000000000000000000ec3c4c7395cc609813": {
   "symbol": "MRVLc",
   "decimals": 8
  },
  "0xb200000000000000000000f111184a74720787e6": {
   "symbol": "CRWVc",
   "decimals": 8
  },
  "0xb200000000000000000000f1a0f91e34892e4718": {
   "symbol": "LLYc",
   "decimals": 8
  },
  "0xb200000000000000000000f215e4c890cfb7176b": {
   "symbol": "CAKEc",
   "decimals": 8
  },
  "0xb200000000000000000000f3049f4aa834b23b64": {
   "symbol": "HSAIc",
   "decimals": 8
  },
  "0xb200000000000000000000f6b0417af5f52341fc": {
   "symbol": "INFYc",
   "decimals": 8
  },
  "0xb200000000000000000000f720c26062bc3067da": {
   "symbol": "TTWOc",
   "decimals": 8
  },
  "0xb200000000000000000000fc737aea6196ab5a4c": {
   "symbol": "AVGOc",
   "decimals": 8
  },
  "0xb200000000000000000000fd2f87532b90095211": {
   "symbol": "MUc",
   "decimals": 8
  },
  "0xb33ff54b9f7242ef1593d2c9bcd8f9df46c77935": {
   "symbol": "FAI",
   "decimals": 18
  },
  "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3": {
   "symbol": "B3",
   "decimals": 18
  },
  "0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c": {
   "symbol": "rETH",
   "decimals": 18
  },
  "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842": {
   "symbol": "MORPHO",
   "decimals": 18
  },
  "0xbf927b841994731c573bdf09ceb0c6b0aa887cdd": {
   "symbol": "VELVET",
   "decimals": 18
  },
  "0xc0634090f2fe6c6d75e61be2b949464abb498973": {
   "symbol": "KTA",
   "decimals": 18
  },
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": {
   "symbol": "wstETH",
   "decimals": 18
  },
  "0xc55e93c62874d8100dbd2dfe307edc1036ad5434": {
   "symbol": "mooBIFI",
   "decimals": 18
  },
  "0xc729777d0470f30612b1564fd96e8dd26f5814e3": {
   "symbol": "SAPIEN",
   "decimals": 18
  },
  "0xcb111e6a2a3bde90856d299d61341ac302167d23": {
   "symbol": "cbMEGA",
   "decimals": 18
  },
  "0xcb17c9db87b595717c857a08468793f5bab6445f": {
   "symbol": "cbLTC",
   "decimals": 8
  },
  "0xcb327b99ff831bf8223cced12b1338ff3aa322ff": {
   "symbol": "bsdETH",
   "decimals": 18
  },
  "0xcb585250f852c6c6bf90434ab21a00f02833a4af": {
   "symbol": "cbXRP",
   "decimals": 6
  },
  "0xcbada732173e39521cdbe8bf59a6dc85a9fc7b8c": {
   "symbol": "cbADA",
   "decimals": 6
  },
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": {
   "symbol": "cbBTC",
   "decimals": 8
  },
  "0xcbd06e5a2b0c65597161de254aa074e489deb510": {
   "symbol": "cbDOGE",
   "decimals": 8
  },
  "0xcef8db49e456f872e288e1c042f916e9ced7c781": {
   "symbol": "MAG7",
   "decimals": 18
  },
  "0xcfa3ef56d303ae4faaba0592388f19d7c3399fb4": {
   "symbol": "eUSD",
   "decimals": 18
  },
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": {
   "symbol": "USDbC",
   "decimals": 6
  },
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186": {
   "symbol": "MUSD",
   "decimals": 18
  },
  "0xe5020a6d073a794b6e7f05678707de47986fb0b6": {
   "symbol": "frxUSD",
   "decimals": 18
  },
  "0xe904aea5e1b110c9174728fa2effc8aed19e98ef": {
   "symbol": "PAXG",
   "decimals": 18
  },
  "0xecac9c5f704e954931349da37f60e39f515c11c1": {
   "symbol": "LBTC",
   "decimals": 8
  },
  "0xed664536023d8e4b1640c394777d34abaff1df8f": {
   "symbol": "POD",
   "decimals": 18
  },
  "0xed6e000def95780fb89734c07ee2ce9f6dcaf110": {
   "symbol": "EDGE",
   "decimals": 18
  },
  "0xeeee77bc7e82c0d4166d52f58239d4c5bf41eeee": {
   "symbol": "WHUF",
   "decimals": 18
  },
  "0xf197ffc28c23e0309b5559e7a166f2c6164c80aa": {
   "symbol": "MXNB",
   "decimals": 6
  },
  "0xf3081494b87e8d5fb7960f066e931d1d0e6e3d67": {
   "symbol": "TAO",
   "decimals": 18
  },
  "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229": {
   "symbol": "ZEN",
   "decimals": 18
  },
  "0xf4d7fd100b5b03e51261a2e6a673632ef2c68896": {
   "symbol": "coinage",
   "decimals": 18
  },
  "0xf4d97f2da56e8c3098f3a8d538db630a2606a024": {
   "symbol": "DIEM",
   "decimals": 18
  },
  "0xfb31f85a8367210b2e4ed2360d2da9dc2d2ccc95": {
   "symbol": "EDEL",
   "decimals": 18
  },
  "0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1": {
   "symbol": "RSC",
   "decimals": 18
  },
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": {
   "symbol": "USDT",
   "decimals": 6
  },
  "0x767a739d1a152639e9ea1d8c1bd55fdc5b217d7f": {
   "symbol": "VEIL",
   "decimals": 18
  },
  "0x7252c865c05378ffc15120f428dd65804dd0ce63": {
   "symbol": "TLOS",
   "decimals": 18
  },
  "0x4154550f4db74dc38d1fe98e1f3f28ed6dad627d": {
   "symbol": "jEUR",
   "decimals": 18
  },
  "0x1f16e03c1a5908818f47f6ee7bb16690b40d0671": {
   "symbol": "RECALL",
   "decimals": 18
  },
  "0x9818b6c09f5ecc843060927e8587c427c7c93583": {
   "symbol": "RIZE",
   "decimals": 18
  },
  "0xff7f8f301f7a706e3cfd3d2275f5dc0b9ee8009b": {
   "symbol": "FOLKS",
   "decimals": 6
  },
  "0x4eb92702ba4cfbf80561bad64d89c706ac824960": {
   "symbol": "RED",
   "decimals": 18
  },
  "0x00000000a22c618fd6b4d7e9a335c4b96b189a38": {
   "symbol": "TOWNS",
   "decimals": 18
  },
  "0x70c8392de9b39a1e48d12a70af6ff4be25d6d0a2": {
   "symbol": "CHZ",
   "decimals": 18
  },
  "0xc08cd26474722ce93f4d0c34d16201461c10aa8c": {
   "symbol": "CARV",
   "decimals": 18
  },
  "0x0ffebc403f2d3dd9ea5501ca03916e98967acb2d": {
   "symbol": "PORTAL",
   "decimals": 18
  },
  "0xf3df0a31ec5ea438150987805e841f960b9471b6": {
   "symbol": "WOO",
   "decimals": 18
  },
  "0xb0ffa8000886e57f86dd5264b9582b2ad87b2b91": {
   "symbol": "W",
   "decimals": 18
  },
  "0x2b11834ed1feaed4b4b3a86a6f571315e25a884d": {
   "symbol": "MOCA",
   "decimals": 18
  },
  "0xc0041ef357b183448b235a8ea73ce4e4ec8c265f": {
   "symbol": "COOKIE",
   "decimals": 18
  },
  "0x8e4cbbcc33db6c0a18561fde1f6ba35906d4848b": {
   "symbol": "MEZO",
   "decimals": 18
  },
  "0x44b63af715d5ef02cc3646a6ce96875e11d69e85": {
   "symbol": "RSGP",
   "decimals": 18
  },
  "0xb755506531786c8ac63b756bab1ac387bacb0c04": {
   "symbol": "ZARP",
   "decimals": 18
  },
  "0x16f93ebc5320c89efc8701577efe49d14a276a06": {
   "symbol": "CADD",
   "decimals": 18
  },
  "0x5e63e9c06c3f2c779ef29a8071f94f5a724eb5e4": {
   "symbol": "CADC",
   "decimals": 6
  }
 }
};
