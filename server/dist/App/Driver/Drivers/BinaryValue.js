"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeBinaryValue = void 0;
const BINARY_PREVIEW_BYTES = 4096;
const BINARY_TEXT_BYTES = 64 * 1024;
/** binary values (BLOB, BINARY, bytea) would be sent as huge array of bytes - client gets size, hex preview and text */
const serializeBinaryValue = (value) => {
    if (!Buffer.isBuffer(value)) {
        return value;
    }
    const previewBytes = value.subarray(0, BINARY_PREVIEW_BYTES);
    const text = value.length <= BINARY_TEXT_BYTES ? value.toString('utf8') : null;
    // replacement character = not valid utf8, control characters = not text
    const isText = text !== null && !text.includes('�') && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
    return {
        binary: true,
        size: value.length,
        hex: previewBytes.toString('hex'),
        truncated: value.length > previewBytes.length,
        text: isText ? text : null,
    };
};
exports.serializeBinaryValue = serializeBinaryValue;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQmluYXJ5VmFsdWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9Ecml2ZXJzL0JpbmFyeVZhbHVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDO0FBQ2xDLE1BQU0saUJBQWlCLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQUVwQyx3SEFBd0g7QUFDakgsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLEtBQVUsRUFBTyxFQUFFO0lBQ3RELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQzNCLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFDRCxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQzdELE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLElBQUksaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMvRSx3RUFBd0U7SUFDeEUsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUcsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJO1FBQ1osSUFBSSxFQUFFLEtBQUssQ0FBQyxNQUFNO1FBQ2xCLEdBQUcsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUNqQyxTQUFTLEVBQUUsS0FBSyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsTUFBTTtRQUM3QyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUk7S0FDM0IsQ0FBQztBQUNKLENBQUMsQ0FBQztBQWZXLFFBQUEsb0JBQW9CLHdCQWUvQiJ9