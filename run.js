const { ethers } = require('ethers');
const solc = require('solc');
const fs = require('fs');

const CONFIG = {
    RPC_URL: 'https://rpc.testnet.tempo.xyz',
    CHAIN_ID: 42429,
    EXPLORER_URL: 'https://explore.tempo.xyz',
    GAS_LIMIT: 3000000,
    MIN_DEPLOY_COUNT: 2,
    MAX_DEPLOY_COUNT: 4,
    INTERVAL_OPTIONS: [6, 12, 24],
    MIN_DELAY_BETWEEN_WALLETS: 5,
    MAX_DELAY_BETWEEN_WALLETS: 30,
    MIN_DELAY_BETWEEN_DEPLOYS: 3,
    MAX_DELAY_BETWEEN_DEPLOYS: 10
};

function getContractSource() {
    return `
pragma solidity ^0.8.20;

contract MyContract {
    string public message = "Hello Tempo!";
    
    event MessageUpdated(address indexed user, string newMessage);
    
    function setMessage(string calldata msg_) external {
        message = msg_;
        emit MessageUpdated(msg.sender, msg_);
    }
}
`;
}

function compileContract(source) {
    console.log('⚙️  Compiling contract...');
    
    const input = {
        language: 'Solidity',
        sources: {
            'MyContract.sol': {
                content: source
            }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            },
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            console.error('❌ Compilation errors:');
            errors.forEach(err => console.error(err.formattedMessage));
            throw new Error('Contract compilation failed');
        }
    }

    const contract = output.contracts['MyContract.sol']['MyContract'];
    console.log('✅ Contract compiled successfully!\n');
    
    return {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object
    };
}

function getPrivateKeys() {
    const content = fs.readFileSync('pk.txt', 'utf8');
    return content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomMessage() {
    const messages = [
        "Hello Tempo",
        "GM Tempo",
        "GN Tempo",
        "Testing Tempo",
        "Done Tempo",
        "Success Tempo",
        "Deployed Tempo",
        "Started Tempo"
    ];
    return getRandomElement(messages);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

async function countdown(seconds, message = 'Next action in') {
    for (let i = seconds; i > 0; i--) {
        process.stdout.write(`\r⏳ ${message}: ${formatTime(i)}   `);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write(`\r✅ ${message}: Ready!                    \n`);
}

async function deployContract(wallet, abi, bytecode, deployNumber, walletIndex) {
    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📦 DEPLOYMENT #${deployNumber} - WALLET #${walletIndex}`);
        console.log('='.repeat(60));
        console.log('💼 Deployer:', wallet.address);
        
        const balance = await wallet.provider.getBalance(wallet.address);
        console.log('💰 Balance:', ethers.formatEther(balance), 'ETH');
        
        if (balance === 0n) {
            throw new Error('Balance 0! Skip wallet ini');
        }
        
        const randomGas = getRandomInt(2500000, CONFIG.GAS_LIMIT);
        console.log('⛽ Gas Limit:', randomGas);
        
        console.log('📝 Deploying contract...');
        const factory = new ethers.ContractFactory(abi, bytecode, wallet);
        const contract = await factory.deploy({
            gasLimit: randomGas
        });
        
        console.log('⏳ Waiting for deployment...');
        await contract.waitForDeployment();
        
        const contractAddress = await contract.getAddress();
        console.log('✅ Contract deployed!');
        console.log('📍 Address:', contractAddress);
        console.log('🔍 Explorer:', `${CONFIG.EXPLORER_URL}/address/${contractAddress}`);
        
        console.log('\n🧪 Testing contract...');
        const message = await contract.message();
        console.log('📨 Initial message:', message);
        
        let txHash = null;
        const shouldUpdate = Math.random() > 0.3;
        
        if (shouldUpdate) {
            const randomDelay = getRandomInt(2, 5);
            await countdown(randomDelay, 'Updating message in');
            
            const newMsg = getRandomMessage();
            console.log(`📤 Setting message: "${newMsg}"`);
            const tx = await contract.setMessage(newMsg, {
                gasLimit: getRandomInt(80000, 120000)
            });
            txHash = tx.hash;
            console.log('⏳ TX Hash:', txHash);
            await tx.wait();
            console.log('✅ Message updated!');
            
            const updatedMessage = await contract.message();
            console.log('📨 New message:', updatedMessage);
        } else {
            console.log('⏭️  Skipping message update (random behavior)');
        }
        
        return {
            success: true,
            deployer: wallet.address,
            contractAddress: contractAddress,
            txHash: txHash,
            explorer: `${CONFIG.EXPLORER_URL}/address/${contractAddress}`,
            timestamp: new Date().toISOString(),
            walletIndex: walletIndex,
            deployNumber: deployNumber
        };
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        return {
            success: false,
            deployer: wallet.address,
            error: error.message,
            timestamp: new Date().toISOString(),
            walletIndex: walletIndex,
            deployNumber: deployNumber
        };
    }
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function processWallet(wallet, abi, bytecode, walletIndex, totalWallets) {
    const deployCount = getRandomInt(CONFIG.MIN_DEPLOY_COUNT, CONFIG.MAX_DEPLOY_COUNT);
    const intervalHours = getRandomElement(CONFIG.INTERVAL_OPTIONS);
    
    console.log(`\n${'█'.repeat(60)}`);
    console.log(`🎯 WALLET #${walletIndex + 1}/${totalWallets}: ${wallet.address}`);
    console.log(`📊 Plan: ${deployCount}x deploy, every ${intervalHours}h`);
    console.log('█'.repeat(60));
    
    const results = [];
    
    for (let i = 0; i < deployCount; i++) {
        const deployNumber = (walletIndex * 100) + i + 1;
        const result = await deployContract(wallet, abi, bytecode, deployNumber, walletIndex + 1);
        results.push(result);
        
        if (i < deployCount - 1) {
            const nextDeploySeconds = intervalHours * 3600;
            const randomVariation = getRandomInt(-600, 600);
            const totalWait = nextDeploySeconds + randomVariation;
            
            console.log(`\n⏰ Next deploy in ~${intervalHours}h (${formatTime(totalWait)})`);
            await countdown(totalWait, `Next deployment (#${i + 2}/${deployCount})`);
        }
    }
    
    return results;
}

async function main() {
    console.log('🚀 ADVANCED AUTO DEPLOY BOT - TEMPO TESTNET');
    console.log('🤖 With Random Scheduling & Anti-Detection\n');
    console.log('📍 Network:', 'Tempo Testnet');
    console.log('🔗 RPC:', CONFIG.RPC_URL);
    console.log('🆔 Chain ID:', CONFIG.CHAIN_ID);
    console.log('🎲 Random Deploy: 2-4x per wallet');
    console.log('⏰ Random Interval: 6h/12h/24h\n');
    
    try {
        const source = getContractSource();
        const { abi, bytecode } = compileContract(source);
        
        const privateKeys = getPrivateKeys();
        console.log(`🔑 Found ${privateKeys.length} wallet(s)\n`);
        
        if (privateKeys.length === 0) {
            throw new Error('No private keys found in pk.txt');
        }
        
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        
        const wallets = privateKeys.map(pk => new ethers.Wallet(pk, provider));
        const shuffledWallets = shuffleArray(wallets);
        
        console.log('🔀 Wallets shuffled for anti-detection');
        console.log('⏱️  Random delays between operations\n');
        
        const allResults = [];
        
        for (let i = 0; i < shuffledWallets.length; i++) {
            const wallet = shuffledWallets[i];
            const walletResults = await processWallet(wallet, abi, bytecode, i, shuffledWallets.length);
            allResults.push(...walletResults);
            
            if (i < shuffledWallets.length - 1) {
                const delaySeconds = getRandomInt(
                    CONFIG.MIN_DELAY_BETWEEN_WALLETS,
                    CONFIG.MAX_DELAY_BETWEEN_WALLETS
                );
                console.log(`\n🔄 Moving to next wallet...`);
                await countdown(delaySeconds, 'Starting next wallet in');
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 FINAL SUMMARY');
        console.log('='.repeat(60));
        
        const successful = allResults.filter(r => r.success);
        const failed = allResults.filter(r => !r.success);
        
        console.log(`✅ Successful: ${successful.length}`);
        console.log(`❌ Failed: ${failed.length}`);
        console.log(`📦 Total: ${allResults.length}`);
        
        const uniqueWallets = new Set(allResults.map(r => r.deployer));
        console.log(`👛 Wallets Used: ${uniqueWallets.size}`);
        
        if (successful.length > 0) {
            console.log('\n✅ Successful Deployments:');
            successful.forEach((r, i) => {
                console.log(`\n${i + 1}. ${r.contractAddress}`);
                console.log(`   Deployer: ${r.deployer}`);
                console.log(`   Wallet #${r.walletIndex} Deploy #${r.deployNumber}`);
                console.log(`   Time: ${new Date(r.timestamp).toLocaleString()}`);
            });
        }
        
        if (failed.length > 0) {
            console.log('\n❌ Failed Deployments:');
            failed.forEach((r, i) => {
                console.log(`\n${i + 1}. Wallet #${r.walletIndex}`);
                console.log(`   Deployer: ${r.deployer}`);
                console.log(`   Error: ${r.error}`);
            });
        }
        
        const summary = {
            network: 'Tempo Testnet',
            chainId: CONFIG.CHAIN_ID,
            botVersion: '3.0.0',
            features: {
                randomDeployCount: `${CONFIG.MIN_DEPLOY_COUNT}-${CONFIG.MAX_DEPLOY_COUNT}`,
                randomIntervals: CONFIG.INTERVAL_OPTIONS.map(h => `${h}h`),
                antiDetection: true,
                shuffledWallets: true,
                randomDelays: true
            },
            totalDeployments: allResults.length,
            successful: successful.length,
            failed: failed.length,
            uniqueWallets: uniqueWallets.size,
            deployments: allResults,
            startTime: new Date(allResults[0]?.timestamp).toISOString(),
            endTime: new Date().toISOString()
        };
        
        fs.writeFileSync('deployments.json', JSON.stringify(summary, null, 2));
        console.log('\n💾 Results saved to deployments.json');
        
        console.log('\n✨ Bot finished!');
        console.log('🎉 All deployments completed with random scheduling!');
        
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main, deployContract, compileContract };
