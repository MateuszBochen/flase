
class StankTraceDto {
    type = ''; // error, warning, success
    message = '';

    constructor(type, message) {
        this.type = type;
        this.message = message;
    }

    static createSuccess(message) {
        return new StankTraceDto('success', message);
    }
    static createError(message) {
        return new StankTraceDto('error', message);
    }
    static createWarning(message) {
        return new StankTraceDto('warning', message);
    }
}

export default StankTraceDto;
