#include <bits/stdc++.h>

using namespace std;

// 重新設計的封裝函數：
// r, g, b: 0-255
// bright4bit: 0-15 (新需求：4個bit)
// hasTransition: 0 或 1 (新需求：最後1個bit)
unsigned int toFirmwareInt(int r, int g, int b, int bright4bit, int hasTransition) {
    // 前 24 位元維持 RGB 顏色
    unsigned int color24 = ((unsigned int)(r & 0xFF) << 16) |
                           ((unsigned int)(g & 0xFF) << 8)  |
                           ((unsigned int)(b & 0xFF));
    
    // 重新封裝最後一個 Byte (8 bits):
    // [亮度 4-bit] [保留 3-bit] [漸變 1-bit]
    // 位移邏輯：
    // 亮度左移 4 位 (佔據 bit 7,6,5,4)
    // 保留位 0 (佔據 bit 3,2,1)
    // 漸變 (佔據 bit 0)
    unsigned int lastByte = ((bright4bit & 0x0F) << 4) | 
                            (hasTransition & 0x01);
    
    return (color24 << 8) | lastByte;
}

int lerp(int start, int end, float fraction) {
    return (int)(start + (end - start) * fraction);
}

int main() {
    srand(time(NULL));
    
    vector<string> bodyParts = {
        "hat", "face", "chestL", "chestR", "armL", "armR", 
        "tie", "belt", "gloveL", "gloveR", "legL", "legR", 
        "shoeL", "shoeR", "board"
    };
    
    int playerCount = 7;
    int dataCount = 20; 
    int partCount = bodyParts.size();

    cout << "{\n  \"players\": [\n";

    for (int p = 0; p < playerCount; p++) {
        struct Color { int r, g, b; };
        vector<Color> startC(partCount), endC(partCount);
        for(int j = 0; j < partCount; j++) {
            startC[j] = {rand() % 256, rand() % 256, rand() % 256};
            endC[j]   = {rand() % 256, rand() % 256, rand() % 256};
        }

        cout << "    [\n";
        for (int i = 0; i < dataCount; i++) {
            float fraction = (float)i / (dataCount - 1);
            int timeValue = i * 10; 

            cout << "      {\"time\": " << timeValue;
            for (int j = 0; j < partCount; j++) {
                int r = lerp(startC[j].r, endC[j].r, fraction);
                int g = lerp(startC[j].g, endC[j].g, fraction);
                int b = lerp(startC[j].b, endC[j].b, fraction);
                
                int brightness = 15; // 4-bit 最大值為 15
                int trans = 1;      // 有漸變，最後一格設為 1
                
                unsigned int val = toFirmwareInt(r, g, b, brightness, trans);
                
                cout << ", \"" << bodyParts[j] << "\": " << val;
            }
            cout << "}" << (i == dataCount - 1 ? "" : ",") << "\n";
        }
        cout << "    ]" << (p == playerCount - 1 ? "" : ",") << "\n";
    }

    cout << "  ]\n}";
    return 0;
}